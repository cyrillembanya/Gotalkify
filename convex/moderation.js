/**
 * Chat safety — what happens when the filter in `moderationRules.js` catches
 * something in a student↔tutor message or an in-class chat message.
 *
 * The rule of the house: a rejection must never `throw`. A Convex mutation
 * that throws rolls back everything it did, which would also roll back the
 * flag we just recorded and the emails we just scheduled. So `screenMessage`
 * records, notifies and returns a refusal; the chat mutations hand that
 * refusal straight back to the client.
 *
 * Escalation, by severity of the harshest rule that matched:
 *   flag           → recorded only; the message still goes through.
 *   block_message  → message refused; the sender and the tutor are emailed to
 *                    contact GoTalkify support; the safety contact is alerted.
 *   block_chat     → message refused *and* the chat is closed; both people are
 *                    emailed to contact the help desk; the safety contact is
 *                    alerted. Only an admin can reopen the chat.
 */

import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { currentUser, requireAdmin, requireUser, getSettings } from "./lib";
import {
  CATEGORIES,
  CATEGORY_KEYS,
  SEVERITIES,
  SEVERITY_KEYS,
  DEFAULT_RULES,
  scanText,
  forgetCompiled,
} from "./moderationRules";

/** Where blocked-chat alerts go when nothing is configured. */
export const FALLBACK_SAFETY_CONTACT = "Adela.fitch@gotalkify.com";

const SITE = () => process.env.SITE_URL ?? "https://gotalkify.com";

const categoryValidator = v.union(...CATEGORY_KEYS.map((key) => v.literal(key)));
const severityValidator = v.union(...SEVERITY_KEYS.map((key) => v.literal(key)));
const kindValidator = v.union(v.literal("keyword"), v.literal("regex"));

/* --------------------------------- settings --------------------------------- */

/** The address that hears about every blocked chat. */
export async function safetyContactEmail(ctx) {
  const settings = await getSettings(ctx);
  return (
    settings.safetyContactEmail?.trim() ||
    process.env.SAFETY_CONTACT_EMAIL?.trim() ||
    FALLBACK_SAFETY_CONTACT
  );
}

/* ---------------------------------- rules ----------------------------------- */

/**
 * The live rule set: the enabled rows, or the built-in list while a deployment
 * has not been seeded yet, so the filter protects chats from the very first
 * message rather than from the first cron tick.
 */
export async function activeRules(ctx) {
  const rows = await ctx.db
    .query("moderationRules")
    .withIndex("by_enabled", (q) => q.eq("enabled", true))
    .collect();
  if (rows.length > 0) return rows;
  const seeded = await ctx.db.query("moderationRules").first();
  if (seeded) return []; // every row is switched off — that is a real choice
  return DEFAULT_RULES.map((rule) => ({ ...rule, enabled: true }));
}

/* -------------------------------- chat blocks -------------------------------- */

/** The active block on a conversation or a classroom, or null. */
export async function activeBlock(ctx, { conversationId, roomId }) {
  if (conversationId) {
    return await ctx.db
      .query("chatBlocks")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversationId).eq("active", true)
      )
      .first();
  }
  if (roomId) {
    return await ctx.db
      .query("chatBlocks")
      .withIndex("by_room", (q) => q.eq("roomId", roomId).eq("active", true))
      .first();
  }
  return null;
}

/** What the chat UIs show when a chat is closed. */
export function blockedNotice(block) {
  return {
    blocked: true,
    blockedAt: block.createdAt,
    reason: block.reason,
    category: block.category,
    message:
      "This chat has been closed by GoTalkify for a safety review. Please contact the help desk at " +
      "support@gotalkify.com — do not try to continue the conversation elsewhere.",
  };
}

/* -------------------------------- notifying --------------------------------- */

async function sendTemplate(ctx, to, template, params) {
  const recipients = [...new Set(to.filter(Boolean))];
  if (recipients.length === 0) return;
  await ctx.scheduler.runAfter(0, internal.emails.sendTemplate, {
    to: recipients,
    template,
    params,
  });
}

const CATEGORY_LABEL = (key) => CATEGORIES[key]?.label ?? key;

/**
 * Everyone who needs to hear about one caught message. `block_chat` closes the
 * chat, so both people are told; `block_message` only refused one message, so
 * the sender and the tutor responsible for the lesson are told. The safety
 * contact hears about both.
 */
async function notifyViolation(ctx, flag, { sender, student, tutor, severity }) {
  const categoryLabels = flag.categories.map(CATEGORY_LABEL).join(", ");
  const surfaceLabel =
    flag.surface === "classroom" ? "Classroom chat" : "Direct messages";
  const flagUrl = `${SITE()}/dashboard/admin/moderation?flag=${flag._id}`;

  if (severity === "block_chat") {
    // The chat is closed for both of them, so both need to know why.
    for (const person of [student, tutor]) {
      if (!person?.email) continue;
      await sendTemplate(ctx, [person.email], "chatBlockedParticipant", {
        recipientName: person.name ?? "there",
        otherName:
          (person._id === student?._id ? tutor?.name : student?.name) ??
          "the other person",
        reason: categoryLabels,
        surface: surfaceLabel,
      });
    }
  } else {
    // One message was refused. The sender is told, and the tutor is told
    // because the lesson relationship is theirs to answer for.
    for (const person of [sender, tutor]) {
      if (!person?.email) continue;
      if (person !== sender && person._id === sender._id) continue;
      await sendTemplate(ctx, [person.email], "chatConductWarning", {
        recipientName: person.name ?? "there",
        senderName: sender.name ?? sender.email ?? "A user",
        aboutSomeoneElse: person._id !== sender._id,
        reason: categoryLabels,
        surface: surfaceLabel,
      });
    }
  }

  await sendTemplate(ctx, [await safetyContactEmail(ctx)], "moderationSafetyAlert", {
    severity: SEVERITIES[severity]?.label ?? severity,
    reason: categoryLabels,
    surface: surfaceLabel,
    senderName: sender.name ?? "Unknown",
    senderEmail: sender.email ?? "—",
    senderRole: flag.senderRole,
    studentName: student?.name ?? "—",
    studentEmail: student?.email ?? "—",
    tutorName: tutor?.name ?? "—",
    tutorEmail: tutor?.email ?? "—",
    matches: flag.matches.join(" | "),
    ruleLabels: flag.ruleLabels.join(", "),
    body: flag.body,
    chatBlocked: flag.chatBlocked,
    flagUrl,
  });
}

/* ------------------------------ the entry point ------------------------------ */

const REFUSAL_COPY = {
  personal_info:
    "For everyone's safety, contact details can't be shared in GoTalkify chats. This chat has been closed and our team has been notified — please contact the help desk.",
  hate:
    "This chat has been closed because of discriminatory language. Our team has been notified — please contact the help desk.",
  contact_evasion:
    "Messages that move the conversation off GoTalkify can't be sent. Please keep lessons and contact on the platform.",
  profanity:
    "That message wasn't sent because it contains language that isn't allowed on GoTalkify. Please contact GoTalkify support if you think this is a mistake.",
  sexual:
    "That message wasn't sent because it contains inappropriate content. Please contact GoTalkify support if you think this is a mistake.",
};

function refusalFor(severity, categories) {
  const ordered = ["personal_info", "hate", "sexual", "profanity", "contact_evasion"];
  const primary = ordered.find((key) => categories.includes(key)) ?? categories[0];
  return {
    ok: false,
    blocked: true,
    chatBlocked: severity === "block_chat",
    category: primary,
    reason:
      REFUSAL_COPY[primary] ??
      "That message wasn't sent because it breaks the GoTalkify chat rules.",
  };
}

/**
 * Screen one outgoing chat message.
 *
 * Returns `{ ok: true }` when the message may be delivered (clean, or only
 * flagged), otherwise a refusal object the caller returns to the client
 * unchanged. Never throws on a violation — see the note at the top of the file.
 */
export async function screenMessage(
  ctx,
  { surface, text, sender, conversationId, roomId, lessonId, studentId, tutorId }
) {
  const settings = await getSettings(ctx);
  if (settings.moderationEnabled === false) return { ok: true };
  const body = String(text ?? "");
  if (!body.trim()) return { ok: true };

  const rules = await activeRules(ctx);
  const { hits, severity, categories } = scanText(body, rules);
  if (!severity) return { ok: true };

  const chatBlocked = severity === "block_chat";
  const messageBlocked = severity !== "flag";

  const student = studentId ? await ctx.db.get(studentId) : null;
  const tutor = tutorId ? await ctx.db.get(tutorId) : null;

  const flagId = await ctx.db.insert("moderationFlags", {
    surface,
    conversationId,
    roomId,
    lessonId,
    senderId: sender._id,
    senderName: sender.name ?? sender.email ?? "User",
    senderRole:
      sender._id === tutorId ? "tutor" : sender._id === studentId ? "student" : (sender.role ?? "user"),
    studentId,
    tutorId,
    severity,
    categories,
    ruleLabels: [...new Set(hits.map((hit) => hit.label))].slice(0, 20),
    matches: [...new Set(hits.map((hit) => hit.match))].slice(0, 20),
    body: body.slice(0, 4000),
    messageBlocked,
    chatBlocked,
    status: "open",
    createdAt: Date.now(),
  });
  const flag = await ctx.db.get(flagId);

  if (chatBlocked && (conversationId || roomId)) {
    const existing = await activeBlock(ctx, { conversationId, roomId });
    if (!existing) {
      await ctx.db.insert("chatBlocks", {
        scope: conversationId ? "conversation" : "room",
        conversationId,
        roomId,
        flagId,
        category: categories[0] ?? "personal_info",
        reason: `Automatic: ${categories.map(CATEGORY_LABEL).join(", ")}`,
        active: true,
        createdAt: Date.now(),
      });
    }
  }

  if (messageBlocked) {
    await notifyViolation(ctx, flag, { sender, student, tutor, severity });
    return refusalFor(severity, categories);
  }
  return { ok: true, flagged: true };
}

/**
 * Refusal for a chat that is already closed — chat mutations call this before
 * doing anything else.
 */
export async function blockedResponse(ctx, { conversationId, roomId }) {
  const block = await activeBlock(ctx, { conversationId, roomId });
  if (!block) return null;
  return {
    ok: false,
    blocked: true,
    chatBlocked: true,
    category: block.category,
    reason:
      "This chat is closed pending a safety review. Please contact the GoTalkify help desk at support@gotalkify.com.",
  };
}

/* ----------------------------------- seeding ---------------------------------- */

async function writeSeed(ctx, adminId) {
  const existing = await ctx.db.query("moderationRules").collect();
  const seen = new Set(existing.map((row) => `${row.kind}::${row.pattern}`));
  const now = Date.now();
  let added = 0;
  for (const rule of DEFAULT_RULES) {
    const key = `${rule.kind}::${rule.pattern}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await ctx.db.insert("moderationRules", {
      category: rule.category,
      kind: rule.kind,
      pattern: rule.pattern,
      label: rule.label,
      severity: rule.severity,
      enabled: true,
      notes: rule.notes,
      builtin: true,
      createdAt: now,
      updatedAt: now,
      updatedBy: adminId,
    });
    added += 1;
  }
  const settings = await ctx.db.query("settings").first();
  if (settings) await ctx.db.patch(settings._id, { moderationSeededAt: now });
  else {
    await ctx.db.insert("settings", {
      commissionPercent: 30,
      cancellationWindowHours: 12,
      confirmationWindowHours: 72,
      minNoticeHours: 2,
      moderationSeededAt: now,
    });
  }
  return { added, total: existing.length + added };
}

/**
 * Write the built-in keyword list to the database the first time. Runs from a
 * cron so a fresh deployment seeds itself, and is a no-op afterwards — an
 * admin's edits and deletions are never undone by it.
 */
export const seedTick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db.query("settings").first();
    if (settings?.moderationSeededAt) return { skipped: true };
    return await writeSeed(ctx);
  },
});

/** "Restore the built-in keywords" — adds back any default row that is missing. */
export const restoreDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);
    return await writeSeed(ctx, admin._id);
  },
});

/* ------------------------------- admin: rules -------------------------------- */

export const catalogue = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("moderationRules").collect();
    const settings = await getSettings(ctx);
    rows.sort(
      (a, b) =>
        CATEGORY_KEYS.indexOf(a.category) - CATEGORY_KEYS.indexOf(b.category) ||
        a.label.localeCompare(b.label)
    );
    return {
      rules: rows,
      seeded: Boolean(settings.moderationSeededAt),
      defaultCount: DEFAULT_RULES.length,
      moderationEnabled: settings.moderationEnabled !== false,
      safetyContactEmail: await safetyContactEmail(ctx),
      categories: CATEGORIES,
      severities: SEVERITIES,
    };
  },
});

export const saveRule = mutation({
  args: {
    id: v.optional(v.id("moderationRules")),
    category: categoryValidator,
    kind: kindValidator,
    pattern: v.string(),
    label: v.string(),
    severity: severityValidator,
    enabled: v.boolean(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...draft }) => {
    const admin = await requireAdmin(ctx);
    const pattern = draft.pattern.trim();
    if (!pattern) throw new ConvexError("Give the rule a keyword or pattern");
    if (pattern.length > 400) throw new ConvexError("That pattern is too long");
    if (draft.kind === "regex") {
      try {
        new RegExp(pattern, "gi");
      } catch (error) {
        throw new ConvexError(`That is not a valid regular expression: ${error.message}`);
      }
    }

    const duplicate = await ctx.db
      .query("moderationRules")
      .withIndex("by_pattern", (q) => q.eq("kind", draft.kind).eq("pattern", pattern))
      .first();
    if (duplicate && duplicate._id !== id) {
      throw new ConvexError("That keyword is already on the list");
    }

    const fields = {
      ...draft,
      pattern,
      label: draft.label.trim() || pattern,
      notes: draft.notes?.trim() || undefined,
      updatedAt: Date.now(),
      updatedBy: admin._id,
    };
    if (id) {
      const existing = await ctx.db.get(id);
      if (!existing) throw new ConvexError("That rule no longer exists");
      forgetCompiled(existing); // the pattern may have changed under the cache
      await ctx.db.patch(id, fields);
      return { ok: true, id };
    }
    const newId = await ctx.db.insert("moderationRules", {
      ...fields,
      builtin: false,
      createdAt: Date.now(),
    });
    return { ok: true, id: newId };
  },
});

export const setRuleEnabled = mutation({
  args: { id: v.id("moderationRules"), enabled: v.boolean() },
  handler: async (ctx, { id, enabled }) => {
    const admin = await requireAdmin(ctx);
    await ctx.db.patch(id, { enabled, updatedAt: Date.now(), updatedBy: admin._id });
    return { ok: true };
  },
});

export const deleteRule = mutation({
  args: { id: v.id("moderationRules") },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    const existing = await ctx.db.get(id);
    if (existing) {
      forgetCompiled(existing);
      await ctx.db.delete(id);
    }
    return { ok: true };
  },
});

/** Try the live rule set against a sample message, without sending anything. */
export const testMessage = query({
  args: { text: v.string() },
  handler: async (ctx, { text }) => {
    await requireAdmin(ctx);
    const rules = await activeRules(ctx);
    const result = scanText(text, rules);
    return {
      ...result,
      wouldBlockMessage: result.severity === "block_message" || result.severity === "block_chat",
      wouldBlockChat: result.severity === "block_chat",
    };
  },
});

/* ------------------------------- admin: flags -------------------------------- */

const FLAG_PAGE = 100;

export const flags = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, { status }) => {
    await requireAdmin(ctx);
    const rows =
      status && status !== "all"
        ? await ctx.db
            .query("moderationFlags")
            .withIndex("by_status", (q) => q.eq("status", status))
            .order("desc")
            .take(FLAG_PAGE)
        : await ctx.db
            .query("moderationFlags")
            .withIndex("by_createdAt")
            .order("desc")
            .take(FLAG_PAGE);

    const result = [];
    for (const row of rows) {
      const block = await activeBlock(ctx, {
        conversationId: row.conversationId,
        roomId: row.roomId,
      });
      const reviewer = row.reviewedBy ? await ctx.db.get(row.reviewedBy) : null;
      result.push({
        ...row,
        chatStillBlocked: Boolean(block),
        blockId: block?._id ?? null,
        reviewedByName: reviewer?.name ?? reviewer?.email ?? null,
      });
    }
    return result;
  },
});

/**
 * Badge count for the admin nav. Mounted in the dashboard shell for every
 * role, so it answers 0 rather than throwing for anyone who is not an admin.
 */
export const openFlagCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user || user.role !== "admin") return 0;
    const rows = await ctx.db
      .query("moderationFlags")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .take(100);
    return rows.length;
  },
});

export const reviewFlag = mutation({
  args: {
    id: v.id("moderationFlags"),
    status: v.union(v.literal("open"), v.literal("reviewed"), v.literal("dismissed")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { id, status, note }) => {
    const admin = await requireAdmin(ctx);
    await ctx.db.patch(id, {
      status,
      reviewNote: note?.trim() || undefined,
      reviewedAt: status === "open" ? undefined : Date.now(),
      reviewedBy: status === "open" ? undefined : admin._id,
    });
    return { ok: true };
  },
});

/* ------------------------------- admin: blocks ------------------------------- */

export const blocks = query({
  args: { includeLifted: v.optional(v.boolean()) },
  handler: async (ctx, { includeLifted }) => {
    await requireAdmin(ctx);
    const rows = includeLifted
      ? await ctx.db.query("chatBlocks").order("desc").take(100)
      : await ctx.db
          .query("chatBlocks")
          .withIndex("by_active", (q) => q.eq("active", true))
          .order("desc")
          .take(100);

    const result = [];
    for (const row of rows) {
      let studentName = "—";
      let tutorName = "—";
      let lessonId = null;
      if (row.conversationId) {
        const conversation = await ctx.db.get(row.conversationId);
        if (conversation) {
          studentName = (await ctx.db.get(conversation.studentId))?.name ?? "Student";
          tutorName = (await ctx.db.get(conversation.tutorId))?.name ?? "Tutor";
        }
      } else if (row.roomId) {
        const lesson = await ctx.db
          .query("lessons")
          .withIndex("by_roomId", (q) => q.eq("roomId", row.roomId))
          .first();
        if (lesson) {
          lessonId = lesson._id;
          studentName = (await ctx.db.get(lesson.studentId))?.name ?? "Student";
          tutorName = (await ctx.db.get(lesson.tutorId))?.name ?? "Tutor";
        }
      }
      const lifter = row.liftedBy ? await ctx.db.get(row.liftedBy) : null;
      result.push({
        ...row,
        studentName,
        tutorName,
        lessonId,
        liftedByName: lifter?.name ?? lifter?.email ?? null,
      });
    }
    return result;
  },
});

/** Reopen a closed chat; both people are told it is usable again. */
export const unblockChat = mutation({
  args: { id: v.id("chatBlocks"), note: v.optional(v.string()) },
  handler: async (ctx, { id, note }) => {
    const admin = await requireAdmin(ctx);
    const block = await ctx.db.get(id);
    if (!block) throw new ConvexError("That block no longer exists");
    if (!block.active) return { ok: true };
    await ctx.db.patch(id, {
      active: false,
      liftedAt: Date.now(),
      liftedBy: admin._id,
      liftNote: note?.trim() || undefined,
    });

    let people = [];
    if (block.conversationId) {
      const conversation = await ctx.db.get(block.conversationId);
      if (conversation) {
        people = [
          await ctx.db.get(conversation.studentId),
          await ctx.db.get(conversation.tutorId),
        ];
      }
    } else if (block.roomId) {
      const lesson = await ctx.db
        .query("lessons")
        .withIndex("by_roomId", (q) => q.eq("roomId", block.roomId))
        .first();
      if (lesson) {
        people = [await ctx.db.get(lesson.studentId), await ctx.db.get(lesson.tutorId)];
      }
    }
    for (const person of people) {
      if (!person?.email) continue;
      await sendTemplate(ctx, [person.email], "chatReopened", {
        recipientName: person.name ?? "there",
        note: note?.trim() ?? "",
      });
    }
    return { ok: true };
  },
});

/** Close a chat by hand from the moderation screen. */
export const blockConversation = mutation({
  args: { conversationId: v.id("conversations"), reason: v.string() },
  handler: async (ctx, { conversationId, reason }) => {
    const admin = await requireAdmin(ctx);
    const conversation = await ctx.db.get(conversationId);
    if (!conversation) throw new ConvexError("Conversation not found");
    const existing = await activeBlock(ctx, { conversationId });
    if (existing) return { ok: true, id: existing._id };
    const id = await ctx.db.insert("chatBlocks", {
      scope: "conversation",
      conversationId,
      category: "manual",
      reason: reason.trim() || "Closed by an administrator",
      active: true,
      createdAt: Date.now(),
      createdBy: admin._id,
    });
    for (const userId of [conversation.studentId, conversation.tutorId]) {
      const person = await ctx.db.get(userId);
      if (!person?.email) continue;
      await sendTemplate(ctx, [person.email], "chatBlockedParticipant", {
        recipientName: person.name ?? "there",
        otherName:
          userId === conversation.studentId
            ? ((await ctx.db.get(conversation.tutorId))?.name ?? "your tutor")
            : ((await ctx.db.get(conversation.studentId))?.name ?? "your student"),
        reason: reason.trim() || "A safety review",
        surface: "Direct messages",
      });
    }
    return { ok: true, id };
  },
});

/* ------------------------------ chat-side queries ----------------------------- */

/** Whether the signed-in user's classroom chat is closed. */
export const roomBlock = query({
  args: { roomId: v.string() },
  handler: async (ctx, { roomId }) => {
    const user = await requireUser(ctx);
    const lesson = await ctx.db
      .query("lessons")
      .withIndex("by_roomId", (q) => q.eq("roomId", roomId))
      .first();
    const isMember =
      user.role === "admin" ||
      (lesson && (lesson.studentId === user._id || lesson.tutorId === user._id));
    if (!isMember) return { blocked: false };
    const block = await activeBlock(ctx, { roomId });
    return block ? blockedNotice(block) : { blocked: false };
  },
});
