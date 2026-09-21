import { query, mutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import {
  attachmentFields,
  currentUser,
  requireUser,
  requireAdmin,
  getBalance,
  withAttachmentUrl,
} from "./lib";

/** Get or create the student↔tutor conversation (unlocked by trial/purchase). */
export async function ensureConversation(ctx, studentId, tutorId) {
  const existing = await ctx.db
    .query("conversations")
    .withIndex("by_pair", (q) => q.eq("studentId", studentId).eq("tutorId", tutorId))
    .first();
  if (existing) return existing._id;
  return await ctx.db.insert("conversations", {
    studentId,
    tutorId,
    lastMessageAt: Date.now(),
    studentUnread: 0,
    tutorUnread: 0,
  });
}

async function conversationsFor(ctx, user) {
  const index = user.role === "tutor" ? "by_tutor" : "by_student";
  const field = user.role === "tutor" ? "tutorId" : "studentId";
  return ctx.db
    .query("conversations")
    .withIndex(index, (q) => q.eq(field, user._id))
    .collect();
}

export const myConversations = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const conversations = await conversationsFor(ctx, user);
    const result = [];
    for (const conversation of conversations) {
      const otherId =
        user.role === "tutor" ? conversation.studentId : conversation.tutorId;
      const other = await ctx.db.get(otherId);
      result.push({
        _id: conversation._id,
        otherName: other?.name ?? other?.email ?? "User",
        otherId,
        lastMessageAt: conversation.lastMessageAt,
        lastMessagePreview: conversation.lastMessagePreview ?? "",
        unread:
          user.role === "tutor"
            ? conversation.tutorUnread
            : conversation.studentUnread,
      });
    }
    result.sort((a, b) => b.lastMessageAt - a.lastMessageAt);
    return result;
  },
});

export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    // Mounted in the dashboard shell, so it can run while auth is still
    // settling (right after sign-up) — stay quiet instead of throwing.
    const user = await currentUser(ctx);
    if (!user) return 0;
    const conversations = await conversationsFor(ctx, user);
    return conversations.reduce(
      (sum, c) => sum + (user.role === "tutor" ? c.tutorUnread : c.studentUnread),
      0
    );
  },
});

export const thread = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const user = await requireUser(ctx);
    const conversation = await ctx.db.get(conversationId);
    if (!conversation) return null;
    const isMember =
      conversation.studentId === user._id || conversation.tutorId === user._id;
    if (!isMember && user.role !== "admin") throw new ConvexError("Not authorized");
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
      .order("desc")
      .take(100);
    const student = await ctx.db.get(conversation.studentId);
    const tutor = await ctx.db.get(conversation.tutorId);
    return {
      conversation: {
        ...conversation,
        studentName: student?.name ?? "Student",
        tutorName: tutor?.name ?? "Tutor",
      },
      messages: await Promise.all(messages.reverse().map((m) => withAttachmentUrl(ctx, m))),
      me: user._id,
    };
  },
});

export const send = mutation({
  args: {
    conversationId: v.id("conversations"),
    body: v.string(),
    attachmentId: v.optional(v.id("_storage")),
    attachmentName: v.optional(v.string()),
    attachmentType: v.optional(v.string()),
    attachmentSize: v.optional(v.number()),
  },
  handler: async (ctx, { conversationId, body, ...attachment }) => {
    const user = await requireUser(ctx);
    const text = body.trim();
    const file = attachmentFields(attachment);
    if (!text && !file.attachmentId) throw new ConvexError("Empty message");
    if (text.length > 4000) throw new ConvexError("Message too long");
    const conversation = await ctx.db.get(conversationId);
    if (!conversation) throw new ConvexError("Conversation not found");
    if (conversation.studentId !== user._id && conversation.tutorId !== user._id) {
      throw new ConvexError("Not authorized");
    }
    const fromStudent = conversation.studentId === user._id;
    await ctx.db.insert("messages", {
      conversationId,
      senderId: user._id,
      body: text,
      ...file,
      sentAt: Date.now(),
    });
    await ctx.db.patch(conversationId, {
      lastMessageAt: Date.now(),
      lastMessagePreview: text.slice(0, 80) || `\u{1F4CE} ${file.attachmentName}`,
      studentUnread: fromStudent
        ? conversation.studentUnread
        : conversation.studentUnread + 1,
      tutorUnread: fromStudent
        ? conversation.tutorUnread + 1
        : conversation.tutorUnread,
    });
  },
});

/** Start (or open) a conversation with a tutor — requires a lesson or balance. */
export const startWithTutor = mutation({
  args: { tutorId: v.id("users") },
  handler: async (ctx, { tutorId }) => {
    const user = await requireUser(ctx);
    const balance = await getBalance(ctx, user._id, tutorId);
    let unlocked = !!balance;
    if (!unlocked) {
      const lesson = await ctx.db
        .query("lessons")
        .withIndex("by_student_start", (q) => q.eq("studentId", user._id))
        .collect();
      unlocked = lesson.some((l) => l.tutorId === tutorId);
    }
    if (!unlocked) {
      throw new ConvexError("Book a trial lesson to message this tutor");
    }
    return await ensureConversation(ctx, user._id, tutorId);
  },
});

export const markRead = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const user = await requireUser(ctx);
    const conversation = await ctx.db.get(conversationId);
    if (!conversation) return;
    if (conversation.studentId === user._id) {
      await ctx.db.patch(conversationId, { studentUnread: 0 });
    } else if (conversation.tutorId === user._id) {
      await ctx.db.patch(conversationId, { tutorUnread: 0 });
    }
  },
});

/** Admin moderation view. */
export const allConversations = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const conversations = await ctx.db.query("conversations").order("desc").take(100);
    const result = [];
    for (const conversation of conversations) {
      const student = await ctx.db.get(conversation.studentId);
      const tutor = await ctx.db.get(conversation.tutorId);
      result.push({
        ...conversation,
        studentName: student?.name ?? "Student",
        tutorName: tutor?.name ?? "Tutor",
      });
    }
    return result;
  },
});
