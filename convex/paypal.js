/**
 * Automated PayPal payouts: sending the money, tracking it to an outcome, and
 * putting it back in the tutor's balance if it isn't delivered.
 *
 * A withdrawal moves through the `payouts` table like this:
 *   processing -> paid       PayPal delivered it
 *   processing -> unclaimed  no PayPal account at that address yet (30 days to claim)
 *   processing -> failed     not delivered, money back in the tutor's balance
 *   paid       -> failed     refunded or reversed later, money back in the balance
 *
 * Status always comes from asking PayPal (syncPayout). A webhook only prompts
 * that check, so forged, repeated or out-of-order events can't change a payout.
 */

import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { DAY_MS, HOUR_MS } from "./lib";
import { entriesOfPayout } from "./wallet";
import {
  cancelItem,
  createPayout,
  getBatch,
  paypalConfigured,
  recipientReason,
  senderBatchId,
  undeliveredReason,
} from "./paypalApi";

const RETRY_FAST_MS = 5 * 60 * 1000;
const RETRY_SLOW_MS = HOUR_MS;
const NO_ANSWER_ALERT_MS = HOUR_MS;
const STUCK_ALERT_MS = 24 * HOUR_MS;
const UNCLAIMED_CHECK_MS = 6 * HOUR_MS;
// PayPal only refuses a repeated sender_batch_id for 30 days. Stop resending well
// before that, because after it a retry could pay the tutor a second time.
export const STOP_RETRY_MS = 25 * DAY_MS;

/* ------------------------------ shared helpers ----------------------------- */

async function emailTutor(ctx, payout, template, params = {}) {
  const tutor = await ctx.db.get(payout.tutorId);
  if (!tutor?.email) return;
  await ctx.scheduler.runAfter(0, internal.emails.sendTemplate, {
    to: [tutor.email],
    template,
    params: {
      recipientName: tutor.name ?? "there",
      amountCents: payout.amountCents,
      ...params,
    },
  });
}

async function emailAdmin(ctx, payout, reason) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;
  const tutor = await ctx.db.get(payout.tutorId);
  await ctx.scheduler.runAfter(0, internal.emails.sendTemplate, {
    to: [adminEmail],
    template: "payoutNeedsAttention",
    params: {
      tutorName: tutor?.name ?? tutor?.email ?? "Tutor",
      amountCents: payout.amountCents,
      paypalEmail: payout.paypalEmail ?? "",
      reason,
    },
  });
}

/** Shows the payout on the admin page, emailing only the first time it's flagged. */
async function flagAttention(ctx, payout, message) {
  await ctx.db.patch(payout._id, { needsAttention: true, paypalError: message });
  if (!payout.needsAttention) await emailAdmin(ctx, payout, message);
}

async function markPaid(ctx, payout, transactionId) {
  await ctx.db.patch(payout._id, {
    status: "paid",
    reference: transactionId ?? payout.reference,
    note: undefined,
    resolvedAt: Date.now(),
    needsAttention: false,
    paypalError: undefined,
    paypalRejected: false,
  });
  for (const entry of await entriesOfPayout(ctx, payout._id)) {
    await ctx.db.patch(entry._id, { status: "paid" });
  }
  await emailTutor(ctx, payout, "payoutProcessed", {
    destination: `your PayPal account (${payout.paypalEmail})`,
    reference: transactionId ?? "",
  });
}

/** Ends the payout and puts the money back in the tutor's available balance. */
export async function returnToBalance(ctx, payout, reason, { resolvedBy } = {}) {
  await ctx.db.patch(payout._id, {
    status: "failed",
    note: reason,
    resolvedAt: Date.now(),
    needsAttention: false,
    paypalRejected: false,
    ...(resolvedBy ? { resolvedBy } : {}),
  });
  for (const entry of await entriesOfPayout(ctx, payout._id)) {
    await ctx.db.patch(entry._id, { status: "available", payoutId: undefined });
  }
  await emailTutor(ctx, payout, "payoutCancelled", { reason });
}

/**
 * PayPal refused and moved no money. A problem with the tutor's account goes back
 * to them. Anything else is ours to fix, so the money stays locked and the admin
 * can retry once it's fixed (for example after topping up the PayPal balance).
 */
async function handleRefusal(ctx, payout, errorName, message) {
  const reason = recipientReason(errorName);
  if (reason) {
    await returnToBalance(ctx, payout, reason);
    return;
  }
  await ctx.db.patch(payout._id, { paypalRejected: true });
  await flagAttention(ctx, payout, message ?? errorName ?? "PayPal refused this payout.");
}

/* -------------------------------- sending ---------------------------------- */

/** Reserves a send attempt, recording it before the call in case the action dies. */
export const beginSend = internalMutation({
  args: { payoutId: v.id("payouts") },
  handler: async (ctx, { payoutId }) => {
    const payout = await ctx.db.get(payoutId);
    if (!payout || payout.method !== "paypal" || payout.status !== "processing") return null;
    if (payout.paypalBatchId || payout.paypalRejected || !payout.paypalEmail) return null;
    const attempt = payout.paypalAttempt ?? 1;
    const priorSends = payout.paypalSendCount ?? 0;
    await ctx.db.patch(payoutId, {
      paypalAttempt: attempt,
      paypalSendCount: priorSends + 1,
      paypalLastAttemptAt: Date.now(),
    });
    return {
      senderBatchId: senderBatchId(payoutId, attempt),
      amountCents: payout.amountCents,
      receiver: payout.paypalEmail,
      priorSends,
    };
  },
});

export const recordSendResult = internalMutation({
  args: {
    payoutId: v.id("payouts"),
    kind: v.union(v.literal("accepted"), v.literal("rejected"), v.literal("retry")),
    batchId: v.optional(v.string()),
    errorName: v.optional(v.string()),
    message: v.optional(v.string()),
    attention: v.optional(v.boolean()),
  },
  handler: async (ctx, { payoutId, kind, batchId, errorName, message, attention }) => {
    const payout = await ctx.db.get(payoutId);
    if (!payout || payout.status !== "processing") return;

    if (kind === "accepted") {
      await ctx.db.patch(payoutId, {
        paypalBatchId: batchId,
        needsAttention: false,
        paypalError: undefined,
      });
      // The webhook normally reports the outcome first. This covers a missed one.
      await ctx.scheduler.runAfter(60 * 1000, internal.paypal.syncPayout, { payoutId });
      return;
    }

    // A webhook may already have told us PayPal has this batch.
    if (payout.paypalBatchId) return;

    if (kind === "rejected") {
      await handleRefusal(ctx, payout, errorName, message);
      return;
    }
    await ctx.db.patch(payoutId, { paypalError: message });
    if (attention) await flagAttention(ctx, payout, message ?? "No clear answer from PayPal.");
  },
});

export const sendPayout = internalAction({
  args: { payoutId: v.id("payouts") },
  handler: async (ctx, { payoutId }) => {
    const claim = await ctx.runMutation(internal.paypal.beginSend, { payoutId });
    if (!claim) return;
    const result = await createPayout({ ...claim, payoutId });
    await ctx.runMutation(internal.paypal.recordSendResult, { payoutId, ...result });
  },
});

/* ------------------------------ tracking status ---------------------------- */

export const getPayout = internalQuery({
  args: { payoutId: v.id("payouts") },
  handler: async (ctx, { payoutId }) => ctx.db.get(payoutId),
});

/** Records what PayPal reports. Safe to run repeatedly with the same answer. */
export const applyStatus = internalMutation({
  args: {
    payoutId: v.id("payouts"),
    batchId: v.string(),
    batchStatus: v.optional(v.string()),
    itemId: v.optional(v.string()),
    itemStatus: v.optional(v.string()),
    transactionId: v.optional(v.string()),
    errorName: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { payoutId, batchId, batchStatus, itemId, itemStatus, transactionId, errorName, errorMessage } = args;
    const payout = await ctx.db.get(payoutId);
    if (!payout || payout.method !== "paypal") return;

    await ctx.db.patch(payoutId, {
      paypalBatchId: batchId,
      paypalItemId: itemId ?? payout.paypalItemId,
      paypalItemStatus: itemStatus ?? payout.paypalItemStatus,
      paypalSyncedAt: Date.now(),
    });

    const open = payout.status === "processing" || payout.status === "unclaimed";
    const refusalMessage = errorMessage
      ? `${errorName ?? "PayPal"}: ${errorMessage}`.slice(0, 500)
      : errorName;

    // A "failed" row has already been returned, so this can't credit it twice.
    const sendBack = async () => {
      if (!open && payout.status !== "paid") return;
      await returnToBalance(ctx, payout, undeliveredReason(itemStatus, errorName));
      if (payout.status === "paid") {
        await emailAdmin(
          ctx,
          payout,
          `A payout already marked as paid came back as ${itemStatus}. The amount has been returned to the tutor's balance.`
        );
      }
    };

    switch (itemStatus) {
      case "SUCCESS":
        if (open) {
          await markPaid(ctx, payout, transactionId);
        } else if (payout.status !== "paid") {
          await flagAttention(
            ctx,
            payout,
            "PayPal now reports this payout as delivered, but it was already returned to the tutor's balance. Check whether they have been paid twice."
          );
        }
        return;

      case "UNCLAIMED":
        if (payout.status === "processing") {
          await ctx.db.patch(payoutId, {
            status: "unclaimed",
            needsAttention: false,
            paypalError: undefined,
            note: "Waiting to be claimed on PayPal. It returns to your balance if it isn't claimed within 30 days.",
          });
          await emailTutor(ctx, payout, "payoutUnclaimed", { paypalEmail: payout.paypalEmail });
        }
        return;

      case "ONHOLD":
        if (open) {
          await flagAttention(
            ctx,
            payout,
            "PayPal is holding this payout for review. Check the PayPal account for any action it needs."
          );
        }
        return;

      case "FAILED":
        if (payout.status === "processing") {
          if (!payout.paypalRejected) {
            await handleRefusal(ctx, payout, errorName, refusalMessage);
          }
          return;
        }
        await sendBack();
        return;

      case "RETURNED":
      case "REFUNDED":
      case "REVERSED":
      case "BLOCKED":
      case "CANCELED":
        await sendBack();
        return;

      default:
        // Still in progress, or the whole batch was turned down with no item result.
        if (
          (batchStatus === "DENIED" || batchStatus === "CANCELED") &&
          payout.status === "processing" &&
          !payout.paypalRejected
        ) {
          await handleRefusal(ctx, payout, errorName, refusalMessage ?? `PayPal batch ${batchStatus}.`);
        }
    }
  },
});

export const syncPayout = internalAction({
  args: { payoutId: v.id("payouts"), batchIdHint: v.optional(v.string()) },
  handler: async (ctx, { payoutId, batchIdHint }) => {
    const payout = await ctx.runQuery(internal.paypal.getPayout, { payoutId });
    const batchId = payout?.paypalBatchId ?? batchIdHint;
    if (!payout || !batchId) return;

    const res = await getBatch(batchId);
    if (!res.ok) {
      console.error(`[paypal] couldn't read batch for payout ${payoutId} (HTTP ${res.status})`);
      return;
    }

    // Ignore anything that isn't this payout's current attempt, such as a late
    // event from an earlier batch PayPal denied.
    const header = res.body.batch_header ?? {};
    const expected = senderBatchId(payoutId, payout.paypalAttempt ?? 1);
    if (header.sender_batch_header?.sender_batch_id !== expected) {
      console.warn(`[paypal] batch ${batchId} isn't the current attempt for payout ${payoutId}`);
      return;
    }
    const item = (res.body.items ?? []).find(
      (row) => row.payout_item?.sender_item_id === payoutId
    );

    await ctx.runMutation(internal.paypal.applyStatus, {
      payoutId,
      batchId,
      batchStatus: header.batch_status,
      itemId: item?.payout_item_id,
      itemStatus: item?.transaction_status,
      transactionId: item?.transaction_id,
      errorName: item?.errors?.name ?? header.errors?.name ?? res.body.errors?.name,
      errorMessage: item?.errors?.message ?? header.errors?.message ?? res.body.errors?.message,
    });
  },
});

/** A verified webhook named this payout, so go and ask PayPal what happened. */
export const handleWebhookEvent = internalMutation({
  args: { payoutRef: v.optional(v.string()), batchId: v.optional(v.string()) },
  handler: async (ctx, { payoutRef, batchId }) => {
    const payoutId = payoutRef ? ctx.db.normalizeId("payouts", payoutRef) : null;
    const payout = payoutId
      ? await ctx.db.get(payoutId)
      : batchId
        ? await ctx.db
            .query("payouts")
            .withIndex("by_paypalBatch", (q) => q.eq("paypalBatchId", batchId))
            .first()
        : null;
    if (!payout || payout.method !== "paypal") return;
    await ctx.scheduler.runAfter(0, internal.paypal.syncPayout, {
      payoutId: payout._id,
      batchIdHint: batchId,
    });
  },
});

/* ------------------------------ unclaimed items ---------------------------- */

export const recordCancelFailure = internalMutation({
  args: { payoutId: v.id("payouts"), message: v.string() },
  handler: async (ctx, { payoutId, message }) => {
    const payout = await ctx.db.get(payoutId);
    if (payout) await flagAttention(ctx, payout, message);
  },
});

export const cancelUnclaimedItem = internalAction({
  args: { payoutId: v.id("payouts") },
  handler: async (ctx, { payoutId }) => {
    const payout = await ctx.runQuery(internal.paypal.getPayout, { payoutId });
    if (payout?.status !== "unclaimed" || !payout.paypalItemId) return;

    let failure = null;
    try {
      const res = await cancelItem(payout.paypalItemId);
      if (!res.ok && res.body?.name !== "ITEM_ALREADY_CANCELLED") {
        failure = `PayPal wouldn't cancel this payout: ${res.body?.name ?? `HTTP ${res.status}`}. It may have just been claimed.`;
      }
    } catch (error) {
      failure = `Couldn't reach PayPal to cancel this payout: ${error.message}`;
    }
    if (failure) {
      await ctx.runMutation(internal.paypal.recordCancelFailure, { payoutId, message: failure });
    }
    // PayPal has the final word on whether the money came back.
    await ctx.runAction(internal.paypal.syncPayout, { payoutId });
  },
});

/* ------------------------------- safety net -------------------------------- */

/**
 * Catches what webhooks and scheduled sends can miss: dropped webhooks, actions
 * that died mid-call, and PayPal outages. Resending is safe because the
 * sender_batch_id only changes after a definite refusal.
 */
export const reconcileTick = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (!paypalConfigured()) return;
    const now = Date.now();
    const rows = [];
    for (const status of ["processing", "unclaimed"]) {
      rows.push(
        ...(await ctx.db
          .query("payouts")
          .withIndex("by_status", (q) => q.eq("status", status))
          .collect())
      );
    }

    for (const payout of rows) {
      // Stripe payouts use "processing" too, and refused ones wait for an admin.
      if (payout.method !== "paypal" || payout.paypalRejected) continue;
      const age = now - (payout.paypalQueuedAt ?? payout.createdAt);

      if (!payout.paypalBatchId) {
        if (age > STOP_RETRY_MS) {
          if (!payout.needsAttention) {
            await flagAttention(
              ctx,
              payout,
              "No clear answer from PayPal for 25 days, so automatic retries have stopped. Check PayPal to see whether this was paid."
            );
          }
          continue;
        }
        if (age > NO_ANSWER_ALERT_MS && !payout.needsAttention) {
          await flagAttention(
            ctx,
            payout,
            `No clear answer from PayPal for over an hour. Still retrying, and it can't be paid twice. Last error: ${payout.paypalError ?? "none recorded"}`
          );
        }
        const gap = age > NO_ANSWER_ALERT_MS ? RETRY_SLOW_MS : RETRY_FAST_MS;
        if (now - (payout.paypalLastAttemptAt ?? 0) >= gap) {
          await ctx.scheduler.runAfter(0, internal.paypal.sendPayout, { payoutId: payout._id });
        }
        continue;
      }

      const gap = payout.status === "unclaimed" ? UNCLAIMED_CHECK_MS : RETRY_FAST_MS;
      if (now - (payout.paypalSyncedAt ?? 0) >= gap) {
        await ctx.db.patch(payout._id, { paypalSyncedAt: now });
        await ctx.scheduler.runAfter(0, internal.paypal.syncPayout, { payoutId: payout._id });
      }
      if (payout.status === "processing" && age > STUCK_ALERT_MS && !payout.needsAttention) {
        await flagAttention(
          ctx,
          payout,
          "PayPal has been processing this payout for over 24 hours. Check the PayPal account."
        );
      }
    }
  },
});
