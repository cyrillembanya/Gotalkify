/**
 * GoTalkify AI support assistant — the public chat widget's backend.
 *
 * The bot answers strictly from admin-authored knowledge rows (`aiKnowledge`)
 * under an admin-editable system prompt (`aiConfig`). It is told to return
 * JSON with an `escalate` flag rather than inventing an answer; when that flag
 * comes back true the conversation is handed to a human: the visitor is asked
 * for an email, the chat moves to "waiting", and an admin can reply from the
 * dashboard. Admin replies land in the same thread the visitor is looking at.
 */

import {
  query,
  mutation,
  action,
  internalQuery,
  internalMutation,
  internalAction,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import {
  requireAdmin,
  currentUser,
  newRoomId,
  verifyTurnstile,
} from "./lib";

/* ---------------------------------- policy ---------------------------------- */

const MAX_MESSAGE_CHARS = 1500;
const HOUR_MS = 60 * 60 * 1000;
/** Shortest gap between two messages in one conversation. */
const MIN_GAP_MS = 1500;
/** Rolling per-conversation cap, so one visitor cannot hammer the model. */
const BURST_WINDOW_MS = 10 * 60 * 1000;
const MAX_MESSAGES_PER_BURST = 20;
/**
 * Platform-wide circuit breakers. Passing either one degrades the widget to
 * the "leave your email" hand-over rather than failing outright, so a bad hour
 * costs a slower support experience instead of an unbounded OpenAI bill.
 */
const MAX_NEW_CHATS_PER_HOUR = 300;
const MAX_AI_REPLIES_PER_HOUR = 600;
/** Turns of history handed to the model (visitor + assistant messages). */
const HISTORY_TURNS = 12;
/** Hard stop so one visitor cannot run up an unbounded bill. */
const MAX_MESSAGES_PER_CHAT = 60;
const KNOWLEDGE_LIMIT = 200;

export const DEFAULT_SYSTEM_PROMPT = `You are the GoTalkify support assistant — a friendly, concise customer support agent for GoTalkify, an online platform where students take one-on-one English and French lessons with professional native tutors.

WHO YOU HELP
Visitors, students and tutors. Typical topics: creating an account and registration, finding and choosing a tutor, trial lessons, booking / rescheduling / cancelling lessons, hour packages and subscriptions, payments and refunds, the online classroom, applying to teach, and tutor earnings and payouts.

HOW TO ANSWER
- Answer ONLY from the "KNOWLEDGE BASE" section provided below. It is the single source of truth and the GoTalkify team keeps it up to date.
- Be brief and practical: two or three short sentences, or a few short steps. Name the page or button the person should use.
- Reply in the same language the person writes in (English or French).
- Be warm, calm and professional. Never claim to be a human.

WHEN YOU DO NOT KNOW
If the knowledge base does not clearly answer the question, or the person asks about their own account, a specific payment, a refund, a dispute, or anything that needs a person to look something up, do NOT guess. Say plainly that you are not sure, offer to pass the question to the GoTalkify support team, and set "escalate" to true.

NEVER
- Never state prices, policies, timeframes or features that are not in the knowledge base.
- Never ask for passwords, card numbers, or ID documents.
- Never promise refunds, discounts, or changes to someone's account.
- Never make up a person, an email address, or a phone number.

RESPONSE FORMAT
Reply with a JSON object and nothing else:
{"answer": "<your reply to the person>", "escalate": <true or false>}`;

const DEFAULT_CONFIG = {
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  model: "gpt-4o-mini",
  temperature: 0.2,
  welcomeMessage:
    "Hi! I'm the GoTalkify assistant. Ask me anything about lessons, tutors, bookings or payments.",
  enabled: true,
};

/** The fallback used whenever the model cannot be reached at all. */
const OFFLINE_REPLY =
  "I can't reach my assistant service right now, but I don't want to leave you waiting — leave your email below and a member of the GoTalkify team will get back to you.";

/* --------------------------------- helpers ---------------------------------- */

async function readConfig(ctx) {
  const row = await ctx.db.query("aiConfig").first();
  return { ...DEFAULT_CONFIG, ...(row ?? {}) };
}

/** Knowledge rows rendered as the grounding block for the model. */
function knowledgeBlock(rows) {
  if (rows.length === 0) {
    return "KNOWLEDGE BASE\n(The knowledge base is empty. You cannot answer any question about GoTalkify from it — set \"escalate\" to true.)";
  }
  const body = rows
    .map((row) => {
      const heading = row.category ? `[${row.category}] ` : "";
      return row.kind === "qa"
        ? `${heading}Q: ${row.question}\nA: ${row.answer}`
        : `${heading}${row.question ? `${row.question}\n` : ""}${row.answer}`;
    })
    .join("\n\n---\n\n");
  return `KNOWLEDGE BASE\n${body}`;
}

/* ------------------------------ public: config ------------------------------ */

/** What the widget needs before the visitor has said anything. */
export const widgetConfig = query({
  args: {},
  handler: async (ctx) => {
    const config = await readConfig(ctx);
    return {
      enabled: config.enabled,
      welcomeMessage: config.welcomeMessage,
    };
  },
});

/* ------------------------------ public: the chat ----------------------------- */

/**
 * Open a conversation. The returned token is the visitor's handle on it.
 * An action rather than a mutation so it can check the CAPTCHA — which is the
 * only per-visitor control available here, since Convex client calls do not
 * carry an IP address.
 */
export const startChat = action({
  args: {
    pagePath: v.optional(v.string()),
    turnstileToken: v.optional(v.string()),
  },
  handler: async (ctx, { pagePath, turnstileToken }) => {
    if (!(await verifyTurnstile(turnstileToken))) {
      throw new ConvexError("CAPTCHA verification failed — please reload the page");
    }
    return await ctx.runMutation(internal.support.insertChat, { pagePath });
  },
});

export const insertChat = internalMutation({
  args: { pagePath: v.optional(v.string()) },
  handler: async (ctx, { pagePath }) => {
    const config = await readConfig(ctx);
    if (!config.enabled) throw new ConvexError("Support chat is currently unavailable");
    const now = Date.now();

    // Circuit breaker: bounded scan, so the check itself stays cheap.
    const recent = await ctx.db
      .query("supportChats")
      .withIndex("by_createdAt", (q) => q.gt("createdAt", now - HOUR_MS))
      .take(MAX_NEW_CHATS_PER_HOUR + 1);
    if (recent.length > MAX_NEW_CHATS_PER_HOUR) {
      throw new ConvexError(
        "Support chat is very busy right now — please use the contact form and we'll get back to you."
      );
    }

    const user = await currentUser(ctx);
    const token = newRoomId();
    await ctx.db.insert("supportChats", {
      token,
      userId: user?._id,
      visitorName: user?.name ?? undefined,
      visitorEmail: user?.email ?? undefined,
      status: "bot",
      pagePath: pagePath?.slice(0, 200),
      messageCount: 0,
      adminUnread: 0,
      lastMessageAt: now,
      createdAt: now,
    });
    return { token };
  },
});

async function chatByToken(ctx, token) {
  return await ctx.db
    .query("supportChats")
    .withIndex("by_token", (q) => q.eq("token", token))
    .first();
}

/** The visitor's own transcript. Reactive, so admin replies stream straight in. */
export const thread = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const chat = await chatByToken(ctx, token);
    if (!chat) return null;
    const messages = await ctx.db
      .query("supportMessages")
      .withIndex("by_chat", (q) => q.eq("chatId", chat._id))
      .order("asc")
      .take(200);
    return {
      status: chat.status,
      hasContact: !!chat.visitorEmail,
      messages: messages.map((m) => ({
        _id: m._id,
        role: m.role,
        text: m.text,
        escalated: m.escalated ?? false,
        authorName: m.authorName,
        createdAt: m.createdAt,
      })),
    };
  },
});

/* --------------------------- internals used by `ask` -------------------------- */

/** Everything the action needs to build one prompt, in a single round-trip. */
export const promptContext = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const chat = await chatByToken(ctx, token);
    if (!chat) return null;
    const config = await readConfig(ctx);
    const knowledge = (
      await ctx.db.query("aiKnowledge").withIndex("by_order").take(KNOWLEDGE_LIMIT)
    ).filter((row) => row.published);
    const history = await ctx.db
      .query("supportMessages")
      .withIndex("by_chat", (q) => q.eq("chatId", chat._id))
      .order("desc")
      .take(HISTORY_TURNS);
    const now = Date.now();
    const lastVisitor = await ctx.db
      .query("supportMessages")
      .withIndex("by_chat", (q) => q.eq("chatId", chat._id))
      .order("desc")
      .filter((q) => q.eq(q.field("role"), "visitor"))
      .first();
    const burst = await ctx.db
      .query("supportMessages")
      .withIndex("by_chat", (q) =>
        q.eq("chatId", chat._id).gt("createdAt", now - BURST_WINDOW_MS)
      )
      .take(MAX_MESSAGES_PER_BURST + 1);
    const aiReplies = await ctx.db
      .query("supportMessages")
      .withIndex("by_role_createdAt", (q) =>
        q.eq("role", "assistant").gt("createdAt", now - HOUR_MS)
      )
      .take(MAX_AI_REPLIES_PER_HOUR + 1);

    return {
      chatId: chat._id,
      messageCount: chat.messageCount,
      status: chat.status,
      config,
      knowledge: knowledgeBlock(knowledge),
      history: history.reverse().map((m) => ({ role: m.role, text: m.text })),
      // Measured from the visitor's own last message: a brand-new chat, or one
      // where only the assistant has spoken, must never be throttled.
      msSinceLastVisitorMessage: lastVisitor
        ? now - lastVisitor.createdAt
        : Number.MAX_SAFE_INTEGER,
      burstCount: burst.length,
      aiRepliesThisHour: aiReplies.length,
    };
  },
});

export const appendMessage = internalMutation({
  args: {
    chatId: v.id("supportChats"),
    role: v.union(
      v.literal("visitor"),
      v.literal("assistant"),
      v.literal("admin")
    ),
    text: v.string(),
    escalated: v.optional(v.boolean()),
    authorName: v.optional(v.string()),
  },
  handler: async (ctx, { chatId, role, text, escalated, authorName }) => {
    const chat = await ctx.db.get(chatId);
    if (!chat) throw new ConvexError("Conversation not found");
    const now = Date.now();
    await ctx.db.insert("supportMessages", {
      chatId,
      role,
      text,
      escalated,
      authorName,
      createdAt: now,
    });
    await ctx.db.patch(chatId, {
      messageCount: chat.messageCount + 1,
      lastMessageAt: now,
      // A visitor writing again after a human answered needs attention anew.
      adminUnread:
        role === "visitor" && chat.status !== "bot"
          ? chat.adminUnread + 1
          : chat.adminUnread,
      status: role === "admin" ? "answered" : chat.status,
    });
  },
});

/* ------------------------------ public: ask the AI ---------------------------- */

/** Call OpenAI and coerce the reply into { answer, escalate }. */
async function completion({ apiKey, config, knowledge, history, question }) {
  const messages = [
    { role: "system", content: config.systemPrompt },
    { role: "system", content: knowledge },
    ...history.map((m) => ({
      role: m.role === "visitor" ? "user" : "assistant",
      content: m.text,
    })),
    { role: "user", content: question },
  ];
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      temperature: config.temperature,
      max_tokens: 500,
      response_format: { type: "json_object" },
      messages,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[support] OpenAI ${res.status}: ${body}`);
    let detail = "";
    try {
      detail = JSON.parse(body)?.error?.message ?? "";
    } catch {
      detail = body.slice(0, 300);
    }
    return {
      answer: OFFLINE_REPLY,
      escalate: true,
      error: `OpenAI returned ${res.status}: ${detail}`.slice(0, 500),
    };
  }
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content ?? "";
  try {
    const parsed = JSON.parse(raw);
    const answer = String(parsed.answer ?? "").trim();
    if (!answer) return { answer: OFFLINE_REPLY, escalate: true };
    return { answer, escalate: parsed.escalate === true };
  } catch {
    // A model that ignored the format still said something useful — use it,
    // but treat the broken contract as a reason to offer a human.
    const text = raw.trim();
    if (!text) return { answer: OFFLINE_REPLY, escalate: true };
    return { answer: text, escalate: true };
  }
}

export const ask = action({
  args: { token: v.string(), text: v.string() },
  handler: async (ctx, { token, text }) => {
    const question = text.trim().slice(0, MAX_MESSAGE_CHARS);
    if (!question) throw new ConvexError("Please type a message");

    const context = await ctx.runQuery(internal.support.promptContext, { token });
    if (!context) throw new ConvexError("This conversation is no longer available");
    if (!context.config.enabled) throw new ConvexError("Support chat is currently unavailable");
    if (context.messageCount >= MAX_MESSAGES_PER_CHAT) {
      throw new ConvexError(
        "This conversation has reached its limit — please start a new one or email support."
      );
    }
    if (context.msSinceLastVisitorMessage < MIN_GAP_MS) {
      throw new ConvexError("You're sending messages very quickly — give it a second.");
    }
    if (context.burstCount > MAX_MESSAGES_PER_BURST) {
      throw new ConvexError(
        "That's a lot of questions at once — please wait a few minutes, or leave your email so our team can help."
      );
    }

    await ctx.runMutation(internal.support.appendMessage, {
      chatId: context.chatId,
      role: "visitor",
      text: question,
    });

    // Once a human owns the conversation the bot stays out of the way.
    if (context.status === "waiting" || context.status === "answered") {
      return { escalate: false, handedOver: true };
    }

    // Over the hourly budget the assistant stops thinking and starts handing
    // over — a slower answer beats an unbounded bill.
    const overBudget = context.aiRepliesThisHour > MAX_AI_REPLIES_PER_HOUR;
    const apiKey = overBudget ? null : process.env.OPENAI_API_KEY;
    const reply = apiKey
      ? await completion({
          apiKey,
          config: context.config,
          knowledge: context.knowledge,
          history: context.history,
          question,
        })
      : {
          answer: OFFLINE_REPLY,
          escalate: true,
          error: overBudget
            ? `Hourly cap of ${MAX_AI_REPLIES_PER_HOUR} AI replies reached.`
            : "OPENAI_API_KEY is not set on the Convex deployment.",
        };

    // Keep the last failure where an admin can see it — an unanswered widget
    // is otherwise indistinguishable from a bot that simply did not know.
    if (reply.error) {
      await ctx.runMutation(internal.support.recordAiError, { error: reply.error });
    } else if (context.config.lastError) {
      await ctx.runMutation(internal.support.recordAiError, { error: null });
    }

    await ctx.runMutation(internal.support.appendMessage, {
      chatId: context.chatId,
      role: "assistant",
      text: reply.answer,
      escalated: reply.escalate,
    });
    return { escalate: reply.escalate, handedOver: false };
  },
});

/** Remember (or clear) the last reason the assistant could not answer. */
export const recordAiError = internalMutation({
  args: { error: v.union(v.string(), v.null()) },
  handler: async (ctx, { error }) => {
    const existing = await ctx.db.query("aiConfig").first();
    const patch = {
      lastError: error ?? undefined,
      lastErrorAt: error ? Date.now() : undefined,
    };
    if (existing) await ctx.db.patch(existing._id, patch);
    else await ctx.db.insert("aiConfig", { ...DEFAULT_CONFIG, ...patch, updatedAt: Date.now() });
  },
});

/* ------------------------------ public: escalation ---------------------------- */

/** Hand the conversation to a human, with a way to reach the visitor back. */
export const requestHuman = mutation({
  args: {
    token: v.string(),
    name: v.optional(v.string()),
    email: v.string(),
  },
  handler: async (ctx, { token, name, email }) => {
    const chat = await chatByToken(ctx, token);
    if (!chat) throw new ConvexError("This conversation is no longer available");
    const address = email.trim().toLowerCase();
    if (!address.includes("@") || address.length < 5) {
      throw new ConvexError("Please enter a valid email address");
    }
    await ctx.db.patch(chat._id, {
      visitorName: name?.trim() || chat.visitorName,
      visitorEmail: address,
      status: "waiting",
      adminUnread: chat.adminUnread + 1,
      lastMessageAt: Date.now(),
    });
    await ctx.db.insert("supportMessages", {
      chatId: chat._id,
      role: "assistant",
      text: `Thanks${name?.trim() ? `, ${name.trim()}` : ""} — I've passed this to the GoTalkify support team. They'll reply here and by email at ${address}.`,
      createdAt: Date.now(),
    });
    await ctx.db.patch(chat._id, { messageCount: chat.messageCount + 1 });
    await ctx.scheduler.runAfter(0, internal.support.notifyAdmin, {
      chatId: chat._id,
    });
    return { ok: true };
  },
});

/** Transcript for the escalation email, then the email itself. */
export const escalationDigest = internalQuery({
  args: { chatId: v.id("supportChats") },
  handler: async (ctx, { chatId }) => {
    const chat = await ctx.db.get(chatId);
    if (!chat) return null;
    const messages = await ctx.db
      .query("supportMessages")
      .withIndex("by_chat", (q) => q.eq("chatId", chatId))
      .order("asc")
      .take(40);
    return {
      name: chat.visitorName ?? "Visitor",
      email: chat.visitorEmail ?? "unknown",
      pagePath: chat.pagePath ?? "/",
      transcript: messages
        .map((m) => {
          const who =
            m.role === "visitor"
              ? chat.visitorName || "Visitor"
              : m.role === "admin"
                ? "Support"
                : "Assistant";
          return `**${who}:** ${m.text}`;
        })
        .join("\n\n"),
    };
  },
});

export const notifyAdmin = internalAction({
  args: { chatId: v.id("supportChats") },
  handler: async (ctx, { chatId }) => {
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) return;
    const digest = await ctx.runQuery(internal.support.escalationDigest, { chatId });
    if (!digest) return;
    await ctx.runAction(internal.emails.sendTemplate, {
      to: [adminEmail],
      template: "supportEscalationAdminAlert",
      params: digest,
    });
  },
});

/* --------------------------------- admin side -------------------------------- */

export const adminConfig = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const config = await readConfig(ctx);
    return {
      ...config,
      hasApiKey: !!process.env.OPENAI_API_KEY,
      defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
    };
  },
});

export const updateConfig = mutation({
  args: {
    systemPrompt: v.string(),
    model: v.string(),
    temperature: v.number(),
    welcomeMessage: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (!args.systemPrompt.trim()) throw new ConvexError("The main prompt cannot be empty");
    if (!args.model.trim()) throw new ConvexError("Pick a model");
    if (args.temperature < 0 || args.temperature > 2) {
      throw new ConvexError("Temperature must be between 0 and 2");
    }
    const patch = { ...args, updatedAt: Date.now() };
    const existing = await ctx.db.query("aiConfig").first();
    if (existing) await ctx.db.patch(existing._id, patch);
    else await ctx.db.insert("aiConfig", patch);
    return { ok: true };
  },
});

export const listKnowledge = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db.query("aiKnowledge").withIndex("by_order").collect();
  },
});

export const saveKnowledge = mutation({
  args: {
    id: v.optional(v.id("aiKnowledge")),
    kind: v.union(v.literal("qa"), v.literal("content")),
    question: v.string(),
    answer: v.string(),
    category: v.optional(v.string()),
    published: v.boolean(),
    order: v.optional(v.number()),
  },
  handler: async (ctx, { id, ...fields }) => {
    await requireAdmin(ctx);
    if (fields.kind === "qa" && !fields.question.trim()) {
      throw new ConvexError("A question is required");
    }
    if (!fields.answer.trim()) throw new ConvexError("An answer is required");
    const patch = {
      kind: fields.kind,
      question: fields.question.trim(),
      answer: fields.answer.trim(),
      category: fields.category?.trim() || undefined,
      published: fields.published,
      updatedAt: Date.now(),
    };
    if (id) {
      await ctx.db.patch(id, {
        ...patch,
        ...(fields.order === undefined ? {} : { order: fields.order }),
      });
      return { id };
    }
    const last = await ctx.db.query("aiKnowledge").withIndex("by_order").order("desc").first();
    const newId = await ctx.db.insert("aiKnowledge", {
      ...patch,
      order: fields.order ?? (last?.order ?? 0) + 1,
    });
    return { id: newId };
  },
});

/**
 * Starter entries drawn from how the platform actually works today. They are a
 * first draft for the team to check and edit — never a substitute for it.
 */
const STARTER_KNOWLEDGE = [
  {
    category: "Getting started",
    question: "What is GoTalkify?",
    answer:
      "GoTalkify is an online platform for one-on-one English and French lessons with professional native tutors. You choose a tutor, book a time that suits you, and take the lesson in our built-in video classroom — nothing to install.",
  },
  {
    category: "Getting started",
    question: "How do I create an account?",
    answer:
      "Click Register on the site, enter your name, email and a password, and confirm the 6-digit code we email you. Creating an account is free.",
  },
  {
    category: "Tutors",
    question: "How do I choose a tutor?",
    answer:
      "Open the Tutors page and filter by the language you want to learn. Each tutor has a profile with a photo, an intro video, their specialties, hourly rate and reviews from other students.",
  },
  {
    category: "Trial lessons",
    question: "What is a trial lesson?",
    answer:
      "A trial lesson is a discounted first lesson with a tutor so you can see if they are a good fit before buying hours. You can book one from any tutor's profile.",
  },
  {
    category: "Booking",
    question: "How do I book a lesson?",
    answer:
      "Open the tutor's profile, pick a free slot in their calendar and confirm. Times are always shown in your own timezone. After booking, the lesson appears under My Lessons in your dashboard.",
  },
  {
    category: "Booking",
    question: "How do I join my lesson?",
    answer:
      "Go to My Lessons in your dashboard and click Join the class. The classroom opens 15 minutes before the start time and runs in your browser — no download needed.",
  },
  {
    category: "Booking",
    question: "Can I cancel or reschedule a lesson?",
    answer:
      "Yes. Cancel or reschedule from My Lessons before the cancellation window closes and the hour goes back to your balance. Cancelling after that point, or not showing up, uses the hour.",
  },
  {
    category: "Payments",
    question: "How do I pay, and what do packages and subscriptions mean?",
    answer:
      "Payments are handled securely by Stripe with a card. You can buy a package of hours with a tutor, or a subscription that renews automatically. Your remaining hours are shown on your dashboard.",
  },
  {
    category: "Payments",
    question: "Where can I see what I have paid?",
    answer:
      "Your dashboard has a Payments page listing every purchase, and a Subscriptions page where you can review or cancel a recurring plan.",
  },
  {
    category: "Tutors",
    question: "How do I apply to become a tutor?",
    answer:
      "Use the Apply page. You will fill in your teaching profile, set your hourly rate, upload a profile photo and a short intro video, and then complete an identity check with a government ID and a quick face scan. Our team reviews every application before you can teach.",
  },
  {
    category: "Tutors",
    question: "How and when do tutors get paid?",
    answer:
      "After a lesson is confirmed by the student (or automatically confirmed once the confirmation window passes), the tutor's share is credited to their GoTalkify wallet. Tutors can withdraw their available balance to their bank at any time through Stripe.",
  },
  {
    category: "Support",
    question: "How do I contact a human?",
    answer:
      "Use the contact form on the site, or ask here to speak to the team and leave your email — a member of GoTalkify support will get back to you.",
  },
];

/** One-time convenience: fill an empty knowledge base with a first draft. */
export const seedStarterKnowledge = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const existing = await ctx.db.query("aiKnowledge").withIndex("by_order").first();
    if (existing) throw new ConvexError("The knowledge base is not empty");
    const now = Date.now();
    let order = 1;
    for (const entry of STARTER_KNOWLEDGE) {
      await ctx.db.insert("aiKnowledge", {
        kind: "qa",
        question: entry.question,
        answer: entry.answer,
        category: entry.category,
        published: true,
        order: order++,
        updatedAt: now,
      });
    }
    return { inserted: STARTER_KNOWLEDGE.length };
  },
});

export const deleteKnowledge = mutation({
  args: { id: v.id("aiKnowledge") },
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    await ctx.db.delete(id);
    return { ok: true };
  },
});

/** Conversations the assistant handed over, plus recent bot-only ones. */
export const adminChats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const chats = await ctx.db
      .query("supportChats")
      .withIndex("by_lastMessageAt")
      .order("desc")
      .take(100);
    const result = [];
    for (const chat of chats) {
      const last = await ctx.db
        .query("supportMessages")
        .withIndex("by_chat", (q) => q.eq("chatId", chat._id))
        .order("desc")
        .first();
      result.push({
        _id: chat._id,
        status: chat.status,
        visitorName: chat.visitorName ?? null,
        visitorEmail: chat.visitorEmail ?? null,
        pagePath: chat.pagePath ?? null,
        adminUnread: chat.adminUnread,
        messageCount: chat.messageCount,
        lastMessageAt: chat.lastMessageAt,
        lastMessagePreview: last?.text?.slice(0, 120) ?? "",
      });
    }
    return result;
  },
});

/** Badge for the admin nav: conversations still waiting on a human. */
export const waitingCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user || user.role !== "admin") return 0;
    const waiting = await ctx.db
      .query("supportChats")
      .withIndex("by_status", (q) => q.eq("status", "waiting"))
      .take(100);
    return waiting.length;
  },
});

/** Total unread visitor messages across every support chat, for the nav badge. */
export const adminUnreadTotal = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user || user.role !== "admin") return 0;
    const chats = await ctx.db
      .query("supportChats")
      .withIndex("by_lastMessageAt")
      .order("desc")
      .take(200);
    return chats.reduce((sum, chat) => sum + (chat.adminUnread ?? 0), 0);
  },
});

export const adminChat = query({
  args: { chatId: v.id("supportChats") },
  handler: async (ctx, { chatId }) => {
    await requireAdmin(ctx);
    const chat = await ctx.db.get(chatId);
    if (!chat) return null;
    const messages = await ctx.db
      .query("supportMessages")
      .withIndex("by_chat", (q) => q.eq("chatId", chatId))
      .order("asc")
      .take(200);
    return { ...chat, messages };
  },
});

export const markChatRead = mutation({
  args: { chatId: v.id("supportChats") },
  handler: async (ctx, { chatId }) => {
    await requireAdmin(ctx);
    const chat = await ctx.db.get(chatId);
    if (chat && chat.adminUnread > 0) await ctx.db.patch(chatId, { adminUnread: 0 });
    return { ok: true };
  },
});

export const closeChat = mutation({
  args: { chatId: v.id("supportChats") },
  handler: async (ctx, { chatId }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(chatId, { status: "closed", adminUnread: 0 });
    return { ok: true };
  },
});

/** Admin answer: into the visitor's live thread, and to their inbox. */
export const adminReply = action({
  args: { chatId: v.id("supportChats"), text: v.string() },
  handler: async (ctx, { chatId, text }) => {
    const body = text.trim().slice(0, 4000);
    if (!body) throw new ConvexError("Write a reply first");
    const author = await ctx.runQuery(internal.support.replyAuthor, {});
    await ctx.runMutation(internal.support.appendMessage, {
      chatId,
      role: "admin",
      text: body,
      authorName: author.name,
    });
    await ctx.runMutation(internal.support.clearUnread, { chatId });
    const recipient = await ctx.runQuery(internal.support.chatRecipient, { chatId });
    if (recipient?.email) {
      await ctx.runAction(internal.emails.sendTemplate, {
        to: [recipient.email],
        template: "supportReply",
        params: { name: recipient.name, message: body },
      });
    }
    return { ok: true, emailed: !!recipient?.email };
  },
});

export const replyAuthor = internalQuery({
  args: {},
  handler: async (ctx) => {
    const user = await requireAdmin(ctx);
    return { name: user.name ?? "GoTalkify Support" };
  },
});

export const chatRecipient = internalQuery({
  args: { chatId: v.id("supportChats") },
  handler: async (ctx, { chatId }) => {
    await requireAdmin(ctx);
    const chat = await ctx.db.get(chatId);
    if (!chat?.visitorEmail) return null;
    return { email: chat.visitorEmail, name: chat.visitorName ?? "there" };
  },
});

export const clearUnread = internalMutation({
  args: { chatId: v.id("supportChats") },
  handler: async (ctx, { chatId }) => {
    await ctx.db.patch(chatId, { adminUnread: 0 });
  },
});
