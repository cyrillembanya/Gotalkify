import { query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { requireRole, getSettings } from "./lib";
import { awaitingPayout } from "./lessons";

/** Escrowed (pending) tutor share for unconfirmed lessons. */
async function computePending(ctx, tutorId) {
  const settings = await getSettings(ctx);
  const lessons = await ctx.db
    .query("lessons")
    .withIndex("by_tutor_start", (q) => q.eq("tutorId", tutorId))
    .collect();
  let pendingCents = 0;
  for (const lesson of lessons) {
    const escrowed =
      (lesson.status === "scheduled" && lesson.type === "regular") ||
      awaitingPayout(lesson);
    if (escrowed && !lesson.payoutReleased) {
      pendingCents +=
        lesson.priceCents -
        Math.round((lesson.priceCents * settings.commissionPercent) / 100);
    }
  }
  return pendingCents;
}

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, "tutor");
    const entries = await ctx.db
      .query("walletEntries")
      .withIndex("by_tutor", (q) => q.eq("tutorId", user._id))
      .order("desc")
      .take(200);
    const availableCents = entries
      .filter((e) => e.type === "earning" && e.status === "available")
      .reduce((sum, e) => sum + e.amountCents, 0);
    const pendingCents = await computePending(ctx, user._id);
    const payouts = await ctx.db
      .query("payouts")
      .withIndex("by_tutor", (q) => q.eq("tutorId", user._id))
      .order("desc")
      .take(50);
    const profile = await ctx.db
      .query("tutorProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();
    return {
      availableCents,
      pendingCents,
      entries,
      payouts,
      connectOnboarded: profile?.stripeConnectOnboarded ?? false,
      hasConnectAccount: !!profile?.stripeConnectAccountId,
    };
  },
});

/** Earnings history with lesson + student context and commission breakdown. */
export const earnings = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, "tutor");
    const entries = await ctx.db
      .query("walletEntries")
      .withIndex("by_tutor", (q) => q.eq("tutorId", user._id))
      .order("desc")
      .take(200);
    const result = [];
    for (const entry of entries) {
      if (entry.type !== "earning" || !entry.lessonId) continue;
      const lesson = await ctx.db.get(entry.lessonId);
      const student = lesson ? await ctx.db.get(lesson.studentId) : null;
      result.push({
        ...entry,
        lessonStartUTC: lesson?.startUTC ?? null,
        studentName: student?.name ?? "Student",
        grossCents: lesson?.priceCents ?? entry.amountCents,
        commissionCents: lesson?.commissionCents ?? 0,
      });
    }
    return result;
  },
});

/**
 * Atomically lock all available earnings into a processing payout.
 * Returns the payout id + amount for the Stripe transfer action.
 */
export const preparePayout = internalMutation({
  args: { tutorId: v.id("users") },
  handler: async (ctx, { tutorId }) => {
    const available = (
      await ctx.db
        .query("walletEntries")
        .withIndex("by_tutor_status", (q) =>
          q.eq("tutorId", tutorId).eq("status", "available")
        )
        .collect()
    ).filter((e) => e.type === "earning");
    const amountCents = available.reduce((sum, e) => sum + e.amountCents, 0);
    if (amountCents <= 0) throw new Error("No available balance to withdraw");
    const payoutId = await ctx.db.insert("payouts", {
      tutorId,
      amountCents,
      status: "processing",
      createdAt: Date.now(),
    });
    for (const entry of available) {
      await ctx.db.patch(entry._id, { status: "locked", payoutId });
    }
    return { payoutId, amountCents };
  },
});

async function entriesOfPayout(ctx, payoutId) {
  const payout = await ctx.db.get(payoutId);
  if (!payout) return [];
  const entries = await ctx.db
    .query("walletEntries")
    .withIndex("by_tutor", (q) => q.eq("tutorId", payout.tutorId))
    .collect();
  return entries.filter((e) => e.payoutId === payoutId);
}

export const finalizePayout = internalMutation({
  args: { payoutId: v.id("payouts"), stripeTransferId: v.string() },
  handler: async (ctx, { payoutId, stripeTransferId }) => {
    await ctx.db.patch(payoutId, { status: "paid", stripeTransferId });
    for (const entry of await entriesOfPayout(ctx, payoutId)) {
      await ctx.db.patch(entry._id, { status: "paid" });
    }
  },
});

export const revertPayout = internalMutation({
  args: { payoutId: v.id("payouts") },
  handler: async (ctx, { payoutId }) => {
    await ctx.db.patch(payoutId, { status: "failed" });
    for (const entry of await entriesOfPayout(ctx, payoutId)) {
      await ctx.db.patch(entry._id, { status: "available", payoutId: undefined });
    }
  },
});

export const getPayout = internalQuery({
  args: { payoutId: v.id("payouts") },
  handler: async (ctx, { payoutId }) => ctx.db.get(payoutId),
});
