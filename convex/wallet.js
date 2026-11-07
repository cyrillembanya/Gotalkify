import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { requireRole, getSettings, tutorProfileForUser, HOUR_MS } from "./lib";
import { awaitingPayout } from "./lessons";
import { paypalConfigured } from "./paypalApi";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// If someone takes over a tutor's account, this gives the tutor time to see the
// email below before the balance can be sent to a new PayPal address.
const PAYPAL_HOLD_MS = 48 * HOUR_MS;

/** What a tutor may see. PayPal errors and admin flags stay on the server. */
function tutorView(payout) {
  return {
    _id: payout._id,
    _creationTime: payout._creationTime,
    amountCents: payout.amountCents,
    method: payout.method,
    paypalEmail: payout.paypalEmail,
    stripeTransferId: payout.stripeTransferId,
    reference: payout.reference,
    note: payout.note,
    status: payout.status,
    createdAt: payout.createdAt,
    resolvedAt: payout.resolvedAt,
  };
}

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
    const profile = await tutorProfileForUser(ctx, user._id);
    return {
      availableCents,
      pendingCents,
      entries,
      payouts: payouts.map(tutorView),
      payoutMethod: profile?.payoutMethod ?? null,
      paypalEmail: profile?.paypalEmail ?? null,
      paypalHoldUntil: profile?.paypalEmailChangedAt
        ? profile.paypalEmailChangedAt + PAYPAL_HOLD_MS
        : null,
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

export const setPayoutMethod = mutation({
  args: {
    method: v.union(v.literal("stripe"), v.literal("paypal")),
    paypalEmail: v.optional(v.string()),
  },
  handler: async (ctx, { method, paypalEmail }) => {
    const user = await requireRole(ctx, "tutor");
    const profile = await tutorProfileForUser(ctx, user._id);
    if (!profile) throw new ConvexError("Tutor profile not found");
    const patch = { payoutMethod: method };
    if (method === "paypal") {
      const email = (paypalEmail ?? "").trim().toLowerCase();
      if (!EMAIL_RE.test(email)) throw new ConvexError("Enter a valid PayPal email address");
      patch.paypalEmail = email;
      if (email !== profile.paypalEmail) {
        patch.paypalEmailChangedAt = Date.now();
        if (user.email) {
          await ctx.scheduler.runAfter(0, internal.emails.sendTemplate, {
            to: [user.email],
            template: "payoutEmailChanged",
            params: { recipientName: user.name ?? "there", paypalEmail: email },
          });
        }
      }
    }
    await ctx.db.patch(profile._id, patch);
    return { ok: true };
  },
});

async function lockAvailableEarnings(ctx, tutorId, payout) {
  const available = (
    await ctx.db
      .query("walletEntries")
      .withIndex("by_tutor_status", (q) =>
        q.eq("tutorId", tutorId).eq("status", "available")
      )
      .collect()
  ).filter((e) => e.type === "earning");
  const amountCents = available.reduce((sum, e) => sum + e.amountCents, 0);
  if (amountCents <= 0) throw new ConvexError("No available balance to withdraw");
  const payoutId = await ctx.db.insert("payouts", {
    tutorId,
    amountCents,
    createdAt: Date.now(),
    ...(typeof payout === "function" ? payout(amountCents) : payout),
  });
  for (const entry of available) {
    await ctx.db.patch(entry._id, { status: "locked", payoutId });
  }
  return { payoutId, amountCents };
}

/**
 * Atomically lock all available earnings into a processing payout.
 * Returns the payout id + amount for the Stripe transfer action.
 */
export const preparePayout = internalMutation({
  args: { tutorId: v.id("users") },
  handler: async (ctx, { tutorId }) =>
    lockAvailableEarnings(ctx, tutorId, { method: "stripe", status: "processing" }),
});

export const requestPaypalPayout = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, "tutor");
    const profile = await tutorProfileForUser(ctx, user._id);
    if (profile?.payoutMethod !== "paypal" || !profile.paypalEmail) {
      throw new ConvexError("Add your PayPal email address first");
    }
    if (profile.paypalEmailChangedAt && Date.now() < profile.paypalEmailChangedAt + PAYPAL_HOLD_MS) {
      throw new ConvexError(
        "For your security, PayPal withdrawals are paused for 48 hours after your PayPal address changes."
      );
    }
    const settings = await getSettings(ctx);
    let autoSend = false;
    const { payoutId, amountCents } = await lockAvailableEarnings(ctx, user._id, (amount) => {
      autoSend = paypalConfigured() && amount <= settings.payoutApprovalThresholdCents;
      return {
        method: "paypal",
        paypalEmail: profile.paypalEmail,
        ...(autoSend
          ? { status: "processing", paypalQueuedAt: Date.now() }
          : { status: "requested" }),
      };
    });
    if (user.email) {
      await ctx.scheduler.runAfter(0, internal.emails.sendTemplate, {
        to: [user.email],
        template: "payoutRequested",
        params: {
          recipientName: user.name ?? "there",
          amountCents,
          paypalEmail: profile.paypalEmail,
          nextStep: autoSend
            ? "We're sending it to PayPal now. Most payouts arrive within minutes, and we'll email you as soon as it's complete."
            : "Our team reviews withdrawals of this size and will process yours within 3 business days. You'll get another email as soon as it's sent.",
        },
      });
    }
    if (autoSend) {
      await ctx.scheduler.runAfter(0, internal.paypal.sendPayout, { payoutId });
      return { ok: true, payoutId, amountCents, status: "processing" };
    }
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      await ctx.scheduler.runAfter(0, internal.emails.sendTemplate, {
        to: [adminEmail],
        template: "payoutRequestAdminAlert",
        params: {
          tutorName: user.name ?? user.email,
          tutorEmail: user.email ?? "",
          amountCents,
          paypalEmail: profile.paypalEmail,
        },
      });
    }
    return { ok: true, payoutId, amountCents, status: "requested" };
  },
});

export async function entriesOfPayout(ctx, payoutId) {
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
