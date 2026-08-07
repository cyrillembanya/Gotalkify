import { query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireUser, creditMinutes } from "./lib";
import { ensureConversation } from "./messages";

/** Student's hour balances per tutor. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const balances = await ctx.db
      .query("hourBalances")
      .withIndex("by_student", (q) => q.eq("studentId", user._id))
      .collect();
    const result = [];
    for (const balance of balances) {
      const tutor = await ctx.db.get(balance.tutorId);
      const profile = await ctx.db
        .query("tutorProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", balance.tutorId))
        .first();
      result.push({
        ...balance,
        tutorName: tutor?.name ?? profile?.name ?? "Tutor",
        tutorProfileId: profile?._id ?? null,
        currentRateCents: profile?.hourlyRateCents ?? balance.purchaseRateCents,
      });
    }
    return result;
  },
});

/** Student's payment history (paid purchases). */
export const myPurchases = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const purchases = await ctx.db
      .query("purchases")
      .withIndex("by_student", (q) => q.eq("studentId", user._id))
      .order("desc")
      .take(100);
    const result = [];
    for (const purchase of purchases) {
      const tutor = await ctx.db.get(purchase.tutorId);
      result.push({ ...purchase, tutorName: tutor?.name ?? "Tutor" });
    }
    return result;
  },
});

/** Pending purchase created before redirecting to Stripe Checkout. */
export const createPendingPurchase = internalMutation({
  args: {
    studentId: v.id("users"),
    tutorId: v.id("users"),
    kind: v.union(v.literal("package"), v.literal("subscription_cycle")),
    hours: v.number(),
    amountCents: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("purchases", {
      ...args,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

export const attachSession = internalMutation({
  args: { purchaseId: v.id("purchases"), sessionId: v.string() },
  handler: async (ctx, { purchaseId, sessionId }) => {
    await ctx.db.patch(purchaseId, { stripeSessionId: sessionId });
  },
});

/** Stripe webhook → package payment completed. Credits hours. Idempotent. */
export const fulfillPackage = internalMutation({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const purchase = await ctx.db
      .query("purchases")
      .withIndex("by_session", (q) => q.eq("stripeSessionId", sessionId))
      .first();
    if (!purchase || purchase.kind !== "package") return;
    if (purchase.status !== "pending") return;

    await ctx.db.patch(purchase._id, { status: "paid" });
    const rateCents = Math.round(purchase.amountCents / purchase.hours);
    await creditMinutes(ctx, {
      studentId: purchase.studentId,
      tutorId: purchase.tutorId,
      minutes: purchase.hours * 60,
      rateCents,
      reason: "purchase",
      purchaseId: purchase._id,
    });
    await ensureConversation(ctx, purchase.studentId, purchase.tutorId);

    const student = await ctx.db.get(purchase.studentId);
    const tutor = await ctx.db.get(purchase.tutorId);
    if (student?.email) {
      await ctx.scheduler.runAfter(0, internal.emails.sendTemplate, {
        to: [student.email],
        template: "paymentReceipt",
        params: {
          recipientName: student.name ?? "there",
          description: `${purchase.hours}-hour package with ${tutor?.name ?? "your tutor"}`,
          amountCents: purchase.amountCents,
        },
      });
    }
  },
});
