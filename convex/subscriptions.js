import { query, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireUser, creditMinutes } from "./lib";
import { ensureConversation } from "./messages";

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_student", (q) => q.eq("studentId", user._id))
      .collect();
    const result = [];
    for (const subscription of subscriptions) {
      const tutor = await ctx.db.get(subscription.tutorId);
      const profile = await ctx.db
        .query("tutorProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", subscription.tutorId))
        .first();
      result.push({
        ...subscription,
        tutorName: tutor?.name ?? profile?.name ?? "Tutor",
        rateCents: profile?.hourlyRateCents ?? 0,
      });
    }
    return result;
  },
});

/**
 * Stripe `invoice.paid` → credit the cycle's hours (rollover = balance
 * accumulates). Idempotent per invoice.
 */
export const handleInvoicePaid = internalMutation({
  args: {
    stripeSubscriptionId: v.string(),
    stripeInvoiceId: v.string(),
    studentId: v.id("users"),
    tutorId: v.id("users"),
    hoursPerCycle: v.number(),
    amountCents: v.number(),
    currentPeriodEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Idempotency: skip if this invoice was already processed.
    const seen = await ctx.db
      .query("purchases")
      .withIndex("by_invoice", (q) => q.eq("stripeInvoiceId", args.stripeInvoiceId))
      .first();
    if (seen) return;

    let subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_stripeSubscription", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .first();
    if (!subscription) {
      await ctx.db.insert("subscriptions", {
        studentId: args.studentId,
        tutorId: args.tutorId,
        stripeSubscriptionId: args.stripeSubscriptionId,
        hoursPerCycle: args.hoursPerCycle,
        status: "active",
        currentPeriodEnd: args.currentPeriodEnd,
      });
    } else {
      await ctx.db.patch(subscription._id, {
        status: "active",
        currentPeriodEnd: args.currentPeriodEnd,
      });
    }

    const purchaseId = await ctx.db.insert("purchases", {
      studentId: args.studentId,
      tutorId: args.tutorId,
      kind: "subscription_cycle",
      hours: args.hoursPerCycle,
      amountCents: args.amountCents,
      stripeInvoiceId: args.stripeInvoiceId,
      status: "paid",
      createdAt: Date.now(),
    });
    const rateCents =
      args.hoursPerCycle > 0
        ? Math.round(args.amountCents / args.hoursPerCycle)
        : 0;
    await creditMinutes(ctx, {
      studentId: args.studentId,
      tutorId: args.tutorId,
      minutes: args.hoursPerCycle * 60,
      rateCents,
      reason: "subscription_renewal",
      purchaseId,
    });
    await ensureConversation(ctx, args.studentId, args.tutorId);

    const student = await ctx.db.get(args.studentId);
    const tutor = await ctx.db.get(args.tutorId);
    if (student?.email) {
      await ctx.scheduler.runAfter(0, internal.emails.sendTemplate, {
        to: [student.email],
        template: "paymentReceipt",
        params: {
          recipientName: student.name ?? "there",
          description: `Subscription renewal — ${args.hoursPerCycle}h with ${tutor?.name ?? "your tutor"}`,
          amountCents: args.amountCents,
        },
      });
    }
  },
});

export const markPastDue = internalMutation({
  args: { stripeSubscriptionId: v.string() },
  handler: async (ctx, { stripeSubscriptionId }) => {
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_stripeSubscription", (q) =>
        q.eq("stripeSubscriptionId", stripeSubscriptionId)
      )
      .first();
    if (subscription) await ctx.db.patch(subscription._id, { status: "past_due" });
  },
});

/** Cancellation stops future credits; remaining hours stay usable. */
export const markCancelled = internalMutation({
  args: { stripeSubscriptionId: v.string() },
  handler: async (ctx, { stripeSubscriptionId }) => {
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_stripeSubscription", (q) =>
        q.eq("stripeSubscriptionId", stripeSubscriptionId)
      )
      .first();
    if (subscription) await ctx.db.patch(subscription._id, { status: "cancelled" });
  },
});

export const getByStripeId = internalQuery({
  args: { stripeSubscriptionId: v.string() },
  handler: async (ctx, { stripeSubscriptionId }) =>
    ctx.db
      .query("subscriptions")
      .withIndex("by_stripeSubscription", (q) =>
        q.eq("stripeSubscriptionId", stripeSubscriptionId)
      )
      .first(),
});
