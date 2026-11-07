/**
 * Payout tests run the real mutations, actions and webhook route against a fake
 * PayPal, so nothing here can reach the real API or move money.
 */

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { classifyCreateResponse, payoutRefFromEvent } from "./paypalApi";

const modules = import.meta.glob("./**/*.js");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** A fake PayPal: records each call and answers from what the test queued. */
function fakePaypal() {
  const state = {
    payoutCalls: [],
    verifyBodies: [],
    cancelCalls: [],
    emails: [],
    createResponses: [],
    batch: null,
    verification: "SUCCESS",
    verifyStatus: 200,
  };
  const json = (status, body) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  vi.stubGlobal("fetch", async (url, init = {}) => {
    const href = String(url);
    if (href.includes("api.resend.com")) {
      state.emails.push(JSON.parse(init.body));
      return json(200, { id: "email" });
    }
    if (href.endsWith("/v1/oauth2/token")) {
      state.tokenHost = new URL(href).host;
      return json(200, { access_token: "token", expires_in: 3600 });
    }
    if (href.endsWith("/v1/notifications/verify-webhook-signature")) {
      state.verifyBodies.push(init.body);
      return json(state.verifyStatus, { verification_status: state.verification });
    }
    if (href.endsWith("/v1/payments/payouts") && init.method === "POST") {
      state.payoutCalls.push({
        host: new URL(href).host,
        headers: init.headers,
        body: JSON.parse(init.body),
      });
      const next = state.createResponses.shift() ?? {
        status: 201,
        body: { batch_header: { payout_batch_id: "BATCH1", batch_status: "PENDING" } },
      };
      if (next.networkError) throw new TypeError("network down");
      return json(next.status, next.body);
    }
    if (href.endsWith("/cancel")) {
      state.cancelCalls.push(href);
      if (state.cancelNetworkError) throw new TypeError("network down");
      return json(state.cancelStatus ?? 200, state.cancelBody ?? { transaction_status: "RETURNED" });
    }
    if (href.includes("/v1/payments/payouts/")) {
      state.batchReads = (state.batchReads ?? 0) + 1;
      return state.batch ? json(200, state.batch) : json(404, { name: "RESOURCE_NOT_FOUND" });
    }
    throw new Error(`Unexpected fetch: ${href}`);
  });
  return state;
}

/** PayPal's answer when asked for a batch, in the shape its API documents. */
function batchWith(payoutId, itemStatus, { attempt = 1, errors, batchStatus = "SUCCESS", transactionId } = {}) {
  return {
    batch_header: {
      payout_batch_id: "BATCH1",
      batch_status: batchStatus,
      sender_batch_header: { sender_batch_id: `${payoutId}-${attempt}` },
    },
    items: itemStatus
      ? [
          {
            payout_item_id: "ITEM1",
            payout_batch_id: "BATCH1",
            transaction_status: itemStatus,
            transaction_id: transactionId,
            errors,
            payout_item: { sender_item_id: payoutId },
          },
        ]
      : [],
  };
}

const signedHeaders = {
  "paypal-auth-algo": "SHA256withRSA",
  "paypal-cert-url": "https://api.paypal.com/cert",
  "paypal-transmission-id": "tx-1",
  "paypal-transmission-sig": "sig",
  "paypal-transmission-time": "2026-11-08T00:00:00Z",
};

async function setup({ cents = 2500, paypalEmail = "tutor@example.com", settings } = {}) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const tutorId = await ctx.db.insert("users", {
      email: "tutor-login@example.com",
      name: "Tess Tutor",
      role: "tutor",
    });
    const adminId = await ctx.db.insert("users", {
      email: "admin@example.com",
      name: "Ada Admin",
      role: "admin",
    });
    const profileId = await ctx.db.insert("tutorProfiles", {
      userId: tutorId,
      name: "Tess Tutor",
      email: "tutor-login@example.com",
      bio: "",
      languagesTaught: ["en"],
      nativeLanguages: ["en"],
      specialties: [],
      hourlyRateCents: 2000,
      qualifications: "",
      approvalStatus: "approved",
      payoutMethod: "paypal",
      paypalEmail,
    });
    const entryId = await ctx.db.insert("walletEntries", {
      tutorId,
      amountCents: cents,
      type: "earning",
      status: "available",
      createdAt: Date.now(),
    });
    if (settings) {
      await ctx.db.insert("settings", {
        commissionPercent: 30,
        cancellationWindowHours: 12,
        confirmationWindowHours: 72,
        minNoticeHours: 2,
        ...settings,
      });
    }
    return { tutorId, adminId, profileId, entryId };
  });
  const asUser = (userId) => t.withIdentity({ subject: `${userId}|session` });
  return { t, ...ids, tutor: asUser(ids.tutorId), admin: asUser(ids.adminId) };
}

const flush = (t) => t.finishAllScheduledFunctions(vi.runAllTimers);
const getRow = (t, table, id) => t.run((ctx) => ctx.db.get(id));
const getPayout = (t, id) => getRow(t, "payouts", id);
const getEntry = (t, id) => getRow(t, "walletEntries", id);

async function withdraw(env) {
  const result = await env.tutor.mutation(api.wallet.requestPaypalPayout, {});
  await flush(env.t);
  return result;
}

const subjects = (paypal) => paypal.emails.map((email) => email.subject);

/** Sends a real webhook through the route, the way PayPal would. */
async function deliverWebhook(t, event, headers = signedHeaders) {
  const res = await t.fetch("/paypal/webhook", {
    method: "POST",
    headers,
    body: typeof event === "string" ? event : JSON.stringify(event),
  });
  await flush(t);
  return res;
}

const itemEvent = (payoutId, type = "SUCCEEDED") => ({
  id: "WH-1",
  event_type: `PAYMENT.PAYOUTS-ITEM.${type}`,
  resource: { payout_batch_id: "BATCH1", payout_item: { sender_item_id: payoutId } },
});

let paypal;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-08T12:00:00Z"));
  process.env.PAYPAL_CLIENT_ID = "client";
  process.env.PAYPAL_CLIENT_SECRET = "secret";
  process.env.PAYPAL_WEBHOOK_ID = "WH-ID";
  process.env.PAYPAL_ENV = "sandbox";
  process.env.ADMIN_EMAIL = "alerts@example.com";
  process.env.RESEND_API_KEY = "re_test";
  process.env.CONVEX_SITE_URL = "https://test.convex.site";
  paypal = fakePaypal();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("requesting a withdrawal", () => {
  test("at or below the limit it goes straight to PayPal with the right details", async () => {
    const env = await setup({ cents: 1999 });
    const result = await withdraw(env);

    expect(result.status).toBe("processing");
    expect(paypal.payoutCalls).toHaveLength(1);
    const { body, headers, host } = paypal.payoutCalls[0];
    expect(host).toBe("api-m.sandbox.paypal.com");
    expect(headers["PayPal-Request-Id"]).toBe(`${result.payoutId}-1`);
    expect(body.sender_batch_header.sender_batch_id).toBe(`${result.payoutId}-1`);
    expect(body.items).toEqual([
      expect.objectContaining({
        recipient_type: "EMAIL",
        amount: { value: "19.99", currency: "USD" },
        receiver: "tutor@example.com",
        sender_item_id: result.payoutId,
      }),
    ]);
    expect((await getEntry(env.t, env.entryId)).status).toBe("locked");
    expect(subjects(paypal).some((s) => s.includes("to approve"))).toBe(false);
  });

  test("PAYPAL_ENV must be exactly live to use the real API", async () => {
    process.env.PAYPAL_ENV = "LIVE";
    await withdraw(await setup());
    expect(paypal.payoutCalls[0].host).toBe("api-m.sandbox.paypal.com");

    process.env.PAYPAL_ENV = "live";
    await withdraw(await setup());
    expect(paypal.payoutCalls[1].host).toBe("api-m.paypal.com");
  });

  test("the exact limit sends, one cent over waits for an admin", async () => {
    const atLimit = await setup({ cents: 50000 });
    expect((await withdraw(atLimit)).status).toBe("processing");

    paypal.payoutCalls.length = 0;
    const overLimit = await setup({ cents: 50001 });
    expect((await withdraw(overLimit)).status).toBe("requested");
    expect(paypal.payoutCalls).toHaveLength(0);
    expect(subjects(paypal).some((s) => s.includes("to approve"))).toBe(true);
  });

  test("a limit of 0 holds every withdrawal for approval", async () => {
    const env = await setup({ cents: 100, settings: { payoutApprovalThresholdCents: 0 } });
    expect((await withdraw(env)).status).toBe("requested");
    expect(paypal.payoutCalls).toHaveLength(0);
  });

  test("without PayPal credentials it falls back to a request an admin handles", async () => {
    delete process.env.PAYPAL_CLIENT_SECRET;
    const env = await setup();
    expect((await withdraw(env)).status).toBe("requested");
    expect(paypal.payoutCalls).toHaveLength(0);
  });

  test("a second click can't withdraw the same balance twice", async () => {
    const env = await setup();
    await env.tutor.mutation(api.wallet.requestPaypalPayout, {});
    await expect(env.tutor.mutation(api.wallet.requestPaypalPayout, {})).rejects.toThrow(
      "No available balance"
    );
    await flush(env.t);
    expect(paypal.payoutCalls).toHaveLength(1);
  });
});

describe("marking a payout paid", () => {
  test("PayPal accepting it isn't enough, only a delivered item counts", async () => {
    const env = await setup();
    const { payoutId } = await withdraw(env);
    let payout = await getPayout(env.t, payoutId);
    expect(payout.status).toBe("processing");
    expect(payout.paypalBatchId).toBe("BATCH1");

    paypal.batch = batchWith(payoutId, "PENDING", { batchStatus: "PROCESSING" });
    await deliverWebhook(env.t, itemEvent(payoutId));
    expect((await getPayout(env.t, payoutId)).status).toBe("processing");

    paypal.batch = batchWith(payoutId, "SUCCESS", { transactionId: "TX123" });
    await deliverWebhook(env.t, itemEvent(payoutId));
    payout = await getPayout(env.t, payoutId);
    expect(payout.status).toBe("paid");
    expect(payout.reference).toBe("TX123");
    expect((await getEntry(env.t, env.entryId)).status).toBe("paid");
    expect(subjects(paypal).filter((s) => s.includes("on the way"))).toHaveLength(1);
  });

  test("a repeated success webhook sends one email and changes nothing", async () => {
    const env = await setup();
    const { payoutId } = await withdraw(env);
    paypal.batch = batchWith(payoutId, "SUCCESS", { transactionId: "TX123" });
    await deliverWebhook(env.t, itemEvent(payoutId));
    await deliverWebhook(env.t, itemEvent(payoutId));
    expect(subjects(paypal).filter((s) => s.includes("on the way"))).toHaveLength(1);
  });
});

describe("never paying twice", () => {
  test("a 5xx keeps the money locked and retries with the same id", async () => {
    const env = await setup();
    paypal.createResponses.push({ status: 500, body: { name: "INTERNAL_SERVER_ERROR" } });
    const { payoutId } = await withdraw(env);

    let payout = await getPayout(env.t, payoutId);
    expect(payout.status).toBe("processing");
    expect(payout.paypalRejected).toBeFalsy();
    expect((await getEntry(env.t, env.entryId)).status).toBe("locked");

    vi.advanceTimersByTime(6 * 60 * 1000);
    await env.t.mutation(internal.paypal.reconcileTick, {});
    await flush(env.t);

    const ids = paypal.payoutCalls.map((c) => c.body.sender_batch_header.sender_batch_id);
    expect(ids).toEqual([`${payoutId}-1`, `${payoutId}-1`]);
    payout = await getPayout(env.t, payoutId);
    expect(payout.paypalBatchId).toBe("BATCH1");
  });

  test("a network failure is treated as unknown, not as a failure", async () => {
    const env = await setup();
    paypal.createResponses.push({ networkError: true });
    const { payoutId } = await withdraw(env);
    const payout = await getPayout(env.t, payoutId);
    expect(payout.status).toBe("processing");
    expect(payout.paypalRejected).toBeFalsy();
    expect((await getEntry(env.t, env.entryId)).status).toBe("locked");
  });

  test("a duplicate error after an unknown outcome adopts the original batch", async () => {
    const env = await setup();
    paypal.createResponses.push({ status: 503, body: {} });
    const { payoutId } = await withdraw(env);

    paypal.createResponses.push({
      status: 400,
      body: {
        name: "USER_BUSINESS_ERROR",
        details: [{ field: "SENDER_BATCH_ID", issue: "Batch with given sender_batch_id already exists" }],
        links: [
          { href: "https://api-m.paypal.com/v1/payments/payouts/ORIGINAL99", rel: "self", method: "GET" },
        ],
      },
    });
    vi.advanceTimersByTime(6 * 60 * 1000);
    await env.t.mutation(internal.paypal.reconcileTick, {});
    await flush(env.t);

    const payout = await getPayout(env.t, payoutId);
    expect(payout.paypalBatchId).toBe("ORIGINAL99");
    expect(payout.paypalRejected).toBeFalsy();
    expect(payout.status).toBe("processing");
    expect((await getEntry(env.t, env.entryId)).status).toBe("locked");
  });

  test("any refusal after an unknown outcome can't be returned to the tutor", async () => {
    const env = await setup();
    paypal.createResponses.push({ status: 500, body: {} });
    const { payoutId } = await withdraw(env);

    paypal.createResponses.push({ status: 422, body: { name: "INSUFFICIENT_FUNDS", message: "low" } });
    vi.advanceTimersByTime(6 * 60 * 1000);
    await env.t.mutation(internal.paypal.reconcileTick, {});
    await flush(env.t);

    const payout = await getPayout(env.t, payoutId);
    expect(payout.paypalRejected).toBeFalsy();
    expect(payout.needsAttention).toBe(true);
    await expect(
      env.admin.mutation(api.admin.returnPayoutToTutor, { payoutId, note: "Sorry" })
    ).rejects.toThrow("Only a payout PayPal refused");
    expect((await getEntry(env.t, env.entryId)).status).toBe("locked");
  });

  test("a returned payout can't be credited twice", async () => {
    const env = await setup();
    const { payoutId } = await withdraw(env);
    paypal.batch = batchWith(payoutId, "RETURNED");
    await deliverWebhook(env.t, itemEvent(payoutId, "RETURNED"));
    await deliverWebhook(env.t, itemEvent(payoutId, "RETURNED"));

    const entry = await getEntry(env.t, env.entryId);
    expect(entry.status).toBe("available");
    expect(entry.payoutId).toBeUndefined();
    expect(subjects(paypal).filter((s) => s.includes("not processed"))).toHaveLength(1);
  });

  test("delivery reported after a return alerts the admin instead of paying", async () => {
    const env = await setup();
    const { payoutId } = await withdraw(env);
    paypal.batch = batchWith(payoutId, "RETURNED");
    await deliverWebhook(env.t, itemEvent(payoutId, "RETURNED"));

    paypal.batch = batchWith(payoutId, "SUCCESS");
    await deliverWebhook(env.t, itemEvent(payoutId));
    const payout = await getPayout(env.t, payoutId);
    expect(payout.status).toBe("failed");
    expect(payout.needsAttention).toBe(true);
    expect(subjects(paypal).some((s) => s.includes("needs attention"))).toBe(true);
  });

  test("automatic resends stop before PayPal's 30-day duplicate protection ends", async () => {
    const env = await setup();
    paypal.createResponses.push({ status: 500, body: {} });
    const { payoutId } = await withdraw(env);
    const calls = paypal.payoutCalls.length;

    vi.advanceTimersByTime(26 * DAY);
    await env.t.mutation(internal.paypal.reconcileTick, {});
    await flush(env.t);

    expect(paypal.payoutCalls).toHaveLength(calls);
    expect((await getPayout(env.t, payoutId)).needsAttention).toBe(true);
    await expect(env.admin.mutation(api.admin.retryPayout, { payoutId })).rejects.toThrow(
      "Too old to resend safely"
    );
  });
});

describe("when PayPal refuses", () => {
  test("a low balance stays locked, alerts the admin and doesn't bother the tutor", async () => {
    const env = await setup();
    paypal.createResponses.push({
      status: 422,
      body: { name: "INSUFFICIENT_FUNDS", message: "Sender does not have sufficient funds." },
    });
    const { payoutId } = await withdraw(env);

    const payout = await getPayout(env.t, payoutId);
    expect(payout.status).toBe("processing");
    expect(payout.paypalRejected).toBe(true);
    expect(payout.needsAttention).toBe(true);
    expect((await getEntry(env.t, env.entryId)).status).toBe("locked");
    expect(subjects(paypal).filter((s) => s.includes("needs attention"))).toHaveLength(1);
    expect(subjects(paypal).some((s) => s.includes("not processed"))).toBe(false);

    // The cron leaves it alone until an admin has fixed the problem.
    vi.advanceTimersByTime(HOUR);
    await env.t.mutation(internal.paypal.reconcileTick, {});
    await flush(env.t);
    expect(paypal.payoutCalls).toHaveLength(1);
  });

  test("an admin retry after a refusal uses a new id and can finish", async () => {
    const env = await setup();
    paypal.createResponses.push({ status: 422, body: { name: "INSUFFICIENT_FUNDS" } });
    const { payoutId } = await withdraw(env);

    await env.admin.mutation(api.admin.retryPayout, { payoutId });
    await flush(env.t);
    expect(paypal.payoutCalls[1].body.sender_batch_header.sender_batch_id).toBe(`${payoutId}-2`);

    paypal.batch = batchWith(payoutId, "SUCCESS", { attempt: 2, transactionId: "TX2" });
    await deliverWebhook(env.t, itemEvent(payoutId));
    expect((await getPayout(env.t, payoutId)).status).toBe("paid");
  });

  test("an admin can return a refused payout to the tutor with a reason", async () => {
    const env = await setup();
    paypal.createResponses.push({ status: 403, body: { name: "AUTHORIZATION_ERROR" } });
    const { payoutId } = await withdraw(env);

    await env.admin.mutation(api.admin.returnPayoutToTutor, { payoutId, note: "Please use Stripe." });
    await flush(env.t);
    const payout = await getPayout(env.t, payoutId);
    expect(payout.status).toBe("failed");
    expect(payout.note).toBe("Please use Stripe.");
    expect((await getEntry(env.t, env.entryId)).status).toBe("available");
  });

  test("a problem with the tutor's account returns the money with a clear reason", async () => {
    const env = await setup();
    const { payoutId } = await withdraw(env);
    paypal.batch = batchWith(payoutId, "FAILED", {
      errors: { name: "RECEIVER_ACCOUNT_LOCKED", message: "raw PayPal text" },
    });
    await deliverWebhook(env.t, itemEvent(payoutId, "FAILED"));

    const payout = await getPayout(env.t, payoutId);
    expect(payout.status).toBe("failed");
    expect(payout.note).toContain("locked or inactive");
    expect(payout.note).not.toContain("raw PayPal text");
    expect((await getEntry(env.t, env.entryId)).status).toBe("available");
  });

  test("an item failure on our side stays locked, and a new error name is treated as ours", async () => {
    for (const name of ["INSUFFICIENT_FUNDS", "SOME_BRAND_NEW_ERROR"]) {
      const env = await setup();
      const { payoutId } = await withdraw(env);
      paypal.batch = batchWith(payoutId, "FAILED", { errors: { name } });
      await deliverWebhook(env.t, itemEvent(payoutId, "FAILED"));

      const payout = await getPayout(env.t, payoutId);
      expect(payout.status).toBe("processing");
      expect(payout.paypalRejected).toBe(true);
      expect((await getEntry(env.t, env.entryId)).status).toBe("locked");
    }
  });

  test("a denied batch is a definite refusal", async () => {
    const env = await setup();
    const { payoutId } = await withdraw(env);
    paypal.batch = batchWith(payoutId, null, { batchStatus: "DENIED" });
    await deliverWebhook(env.t, {
      event_type: "PAYMENT.PAYOUTSBATCH.DENIED",
      resource: {
        batch_header: {
          payout_batch_id: "BATCH1",
          sender_batch_header: { sender_batch_id: `${payoutId}-1` },
        },
      },
    });
    const payout = await getPayout(env.t, payoutId);
    expect(payout.paypalRejected).toBe(true);
    expect(payout.needsAttention).toBe(true);
  });

  test("a late event from an old attempt can't change the current one", async () => {
    const env = await setup();
    paypal.createResponses.push({ status: 422, body: { name: "INSUFFICIENT_FUNDS" } });
    const { payoutId } = await withdraw(env);
    paypal.createResponses.push({ status: 500, body: {} });
    await env.admin.mutation(api.admin.retryPayout, { payoutId });
    await flush(env.t);

    paypal.batch = batchWith(payoutId, "RETURNED", { attempt: 1 });
    await deliverWebhook(env.t, itemEvent(payoutId, "RETURNED"));

    const payout = await getPayout(env.t, payoutId);
    expect(payout.status).toBe("processing");
    expect((await getEntry(env.t, env.entryId)).status).toBe("locked");
  });
});

describe("unclaimed and undelivered payouts", () => {
  test("unclaimed tells the tutor once and can still complete", async () => {
    const env = await setup();
    const { payoutId } = await withdraw(env);
    paypal.batch = batchWith(payoutId, "UNCLAIMED", { errors: { name: "RECEIVER_UNREGISTERED" } });
    await deliverWebhook(env.t, itemEvent(payoutId, "UNCLAIMED"));
    await deliverWebhook(env.t, itemEvent(payoutId, "UNCLAIMED"));

    expect((await getPayout(env.t, payoutId)).status).toBe("unclaimed");
    expect((await getEntry(env.t, env.entryId)).status).toBe("locked");
    expect(subjects(paypal).filter((s) => s.startsWith("Claim your"))).toHaveLength(1);

    paypal.batch = batchWith(payoutId, "SUCCESS", { transactionId: "TX9" });
    await deliverWebhook(env.t, itemEvent(payoutId));
    const payout = await getPayout(env.t, payoutId);
    expect(payout.status).toBe("paid");
    expect(payout.note).toBeUndefined();
  });

  test("unclaimed for 30 days returns to the balance", async () => {
    const env = await setup();
    const { payoutId } = await withdraw(env);
    paypal.batch = batchWith(payoutId, "UNCLAIMED");
    await deliverWebhook(env.t, itemEvent(payoutId, "UNCLAIMED"));

    paypal.batch = batchWith(payoutId, "RETURNED");
    vi.advanceTimersByTime(7 * HOUR);
    await env.t.mutation(internal.paypal.reconcileTick, {});
    await flush(env.t);

    expect((await getPayout(env.t, payoutId)).status).toBe("failed");
    expect((await getEntry(env.t, env.entryId)).status).toBe("available");
  });

  test("an admin can cancel an unclaimed payout", async () => {
    const env = await setup();
    const { payoutId } = await withdraw(env);
    paypal.batch = batchWith(payoutId, "UNCLAIMED");
    await deliverWebhook(env.t, itemEvent(payoutId, "UNCLAIMED"));

    paypal.batch = batchWith(payoutId, "RETURNED");
    await env.admin.mutation(api.admin.cancelUnclaimedPayout, { payoutId });
    await flush(env.t);

    expect(paypal.cancelCalls[0]).toContain("/v1/payments/payouts-item/ITEM1/cancel");
    expect((await getEntry(env.t, env.entryId)).status).toBe("available");
  });

  test("if the tutor claimed it first, cancelling leaves it paid", async () => {
    const env = await setup();
    const { payoutId } = await withdraw(env);
    paypal.batch = batchWith(payoutId, "UNCLAIMED");
    await deliverWebhook(env.t, itemEvent(payoutId, "UNCLAIMED"));

    paypal.cancelStatus = 400;
    paypal.cancelBody = { name: "ITEM_INCORRECT_STATUS" };
    paypal.batch = batchWith(payoutId, "SUCCESS", { transactionId: "TX7" });
    await env.admin.mutation(api.admin.cancelUnclaimedPayout, { payoutId });
    await flush(env.t);

    expect((await getPayout(env.t, payoutId)).status).toBe("paid");
    expect((await getEntry(env.t, env.entryId)).status).toBe("paid");
  });

  test("if PayPal can't be reached to cancel, the admin is told and nothing moves", async () => {
    const env = await setup();
    const { payoutId } = await withdraw(env);
    paypal.batch = batchWith(payoutId, "UNCLAIMED");
    await deliverWebhook(env.t, itemEvent(payoutId, "UNCLAIMED"));

    paypal.cancelNetworkError = true;
    await env.admin.mutation(api.admin.cancelUnclaimedPayout, { payoutId });
    await flush(env.t);

    const payout = await getPayout(env.t, payoutId);
    expect(payout.status).toBe("unclaimed");
    expect(payout.needsAttention).toBe(true);
    expect(payout.paypalError).toContain("Couldn't reach PayPal");
    expect((await getEntry(env.t, env.entryId)).status).toBe("locked");
  });

  test("a refund event with only a batch id still finds the paid payout", async () => {
    const env = await setup();
    const { payoutId } = await withdraw(env);
    paypal.batch = batchWith(payoutId, "SUCCESS", { transactionId: "TX1" });
    await deliverWebhook(env.t, itemEvent(payoutId));

    paypal.batch = batchWith(payoutId, "REFUNDED", { transactionId: "TX1" });
    await deliverWebhook(env.t, {
      event_type: "PAYMENT.PAYOUTS-ITEM.REFUNDED",
      resource: { payout_batch_id: "BATCH1" },
    });
    expect((await getPayout(env.t, payoutId)).status).toBe("failed");
    expect((await getEntry(env.t, env.entryId)).status).toBe("available");
  });

  test("a refund after payment returns the money and alerts the admin", async () => {
    const env = await setup();
    const { payoutId } = await withdraw(env);
    paypal.batch = batchWith(payoutId, "SUCCESS", { transactionId: "TX1" });
    await deliverWebhook(env.t, itemEvent(payoutId));

    paypal.batch = batchWith(payoutId, "REFUNDED", { transactionId: "TX1" });
    await deliverWebhook(env.t, itemEvent(payoutId, "REFUNDED"));

    expect((await getPayout(env.t, payoutId)).status).toBe("failed");
    expect((await getEntry(env.t, env.entryId)).status).toBe("available");
    expect(subjects(paypal).some((s) => s.includes("needs attention"))).toBe(true);
  });

  test("a hold alerts the admin once while the money stays locked", async () => {
    const env = await setup();
    const { payoutId } = await withdraw(env);
    paypal.batch = batchWith(payoutId, "ONHOLD");
    await deliverWebhook(env.t, itemEvent(payoutId, "HELD"));
    await deliverWebhook(env.t, itemEvent(payoutId, "HELD"));

    expect((await getPayout(env.t, payoutId)).status).toBe("processing");
    expect(subjects(paypal).filter((s) => s.includes("needs attention"))).toHaveLength(1);
  });
});

describe("the webhook route", () => {
  test("an unsigned request never reaches PayPal or changes anything", async () => {
    const env = await setup();
    const { payoutId } = await withdraw(env);
    const res = await deliverWebhook(env.t, itemEvent(payoutId), {});
    expect(res.status).toBe(400);
    expect(paypal.verifyBodies).toHaveLength(0);
    expect((await getPayout(env.t, payoutId)).status).toBe("processing");
  });

  test("a signature PayPal rejects changes nothing", async () => {
    const env = await setup();
    const { payoutId } = await withdraw(env);
    paypal.verification = "FAILURE";
    paypal.batch = batchWith(payoutId, "SUCCESS");
    paypal.batchReads = 0;
    const res = await deliverWebhook(env.t, itemEvent(payoutId));
    expect(res.status).toBe(400);
    expect(paypal.batchReads).toBe(0);
    expect((await getPayout(env.t, payoutId)).status).toBe("processing");
  });

  test("an event's own claim of success isn't trusted, PayPal is asked", async () => {
    const env = await setup();
    const { payoutId } = await withdraw(env);
    paypal.batch = batchWith(payoutId, "PENDING", { batchStatus: "PROCESSING" });
    const res = await deliverWebhook(env.t, {
      ...itemEvent(payoutId, "SUCCEEDED"),
      resource: {
        ...itemEvent(payoutId).resource,
        transaction_status: "SUCCESS",
      },
    });
    expect(res.status).toBe(200);
    expect((await getPayout(env.t, payoutId)).status).toBe("processing");
  });

  test("the signature check receives the event's exact bytes", async () => {
    const env = await setup();
    const { payoutId } = await withdraw(env);
    // Spacing and key order that JSON.parse then JSON.stringify would not preserve.
    const raw = `{ "resource": {"payout_item":{"sender_item_id":"${payoutId}"}},   "event_type":"PAYMENT.PAYOUTS-ITEM.SUCCEEDED" }`;
    await deliverWebhook(env.t, raw);
    expect(paypal.verifyBodies[0].endsWith(`"webhook_event":${raw}}`)).toBe(true);
    expect(JSON.parse(paypal.verifyBodies[0]).webhook_id).toBe("WH-ID");
  });

  test("if PayPal can't verify right now, it replies so PayPal sends it again", async () => {
    const env = await setup();
    const { payoutId } = await withdraw(env);
    paypal.verifyStatus = 503;
    const res = await deliverWebhook(env.t, itemEvent(payoutId));
    expect(res.status).toBe(503);
  });

  test("events for other payments or unknown ids are ignored with a 200", async () => {
    const env = await setup();
    const other = await env.t.run((ctx) =>
      ctx.db.insert("settings", {
        commissionPercent: 1,
        cancellationWindowHours: 1,
        confirmationWindowHours: 1,
        minNoticeHours: 1,
      })
    );
    for (const ref of ["not-an-id", other]) {
      const res = await deliverWebhook(env.t, itemEvent(ref));
      expect(res.status).toBe(200);
    }
    const res = await deliverWebhook(env.t, { event_type: "CHECKOUT.ORDER.APPROVED", resource: {} });
    expect(res.status).toBe(200);
  });

  test("a webhook arriving before the send is recorded still finishes the payout", async () => {
    const env = await setup();
    const { payoutId } = await env.tutor.mutation(api.wallet.requestPaypalPayout, {});
    await env.t.run((ctx) => ctx.db.patch(payoutId, { paypalAttempt: 1 }));
    paypal.batch = batchWith(payoutId, "SUCCESS", { transactionId: "TX5" });

    await deliverWebhook(env.t, itemEvent(payoutId));
    const payout = await getPayout(env.t, payoutId);
    expect(payout.status).toBe("paid");
    expect(payout.paypalBatchId).toBe("BATCH1");
  });
});

describe("the safety-net cron", () => {
  test("picks up a send that never ran", async () => {
    const env = await setup();
    const payoutId = await env.t.run(async (ctx) => {
      const id = await ctx.db.insert("payouts", {
        tutorId: env.tutorId,
        amountCents: 2500,
        method: "paypal",
        paypalEmail: "tutor@example.com",
        status: "processing",
        createdAt: Date.now(),
        paypalQueuedAt: Date.now(),
      });
      await ctx.db.patch(env.entryId, { status: "locked", payoutId: id });
      return id;
    });
    await env.t.mutation(internal.paypal.reconcileTick, {});
    await flush(env.t);
    expect(paypal.payoutCalls).toHaveLength(1);
    expect((await getPayout(env.t, payoutId)).paypalBatchId).toBe("BATCH1");
  });

  test("finishes a payout whose webhook never arrived", async () => {
    const env = await setup();
    const { payoutId } = await withdraw(env);
    paypal.batch = batchWith(payoutId, "SUCCESS", { transactionId: "TX6" });
    vi.advanceTimersByTime(6 * 60 * 1000);
    await env.t.mutation(internal.paypal.reconcileTick, {});
    await flush(env.t);
    expect((await getPayout(env.t, payoutId)).status).toBe("paid");
  });

  test("leaves Stripe payouts alone", async () => {
    const env = await setup();
    await env.t.run((ctx) =>
      ctx.db.insert("payouts", {
        tutorId: env.tutorId,
        amountCents: 100,
        method: "stripe",
        // An address on the row proves the method check itself stops the send.
        paypalEmail: "tutor@example.com",
        status: "processing",
        createdAt: Date.now(),
      })
    );
    await env.t.mutation(internal.paypal.reconcileTick, {});
    await flush(env.t);
    expect(paypal.payoutCalls).toHaveLength(0);
  });

  test("alerts once when PayPal gives no clear answer for over an hour", async () => {
    const env = await setup();
    paypal.createResponses.push(
      { status: 500, body: {} },
      { status: 500, body: {} },
      { status: 500, body: {} }
    );
    const { payoutId } = await withdraw(env);

    vi.advanceTimersByTime(2 * HOUR);
    await env.t.mutation(internal.paypal.reconcileTick, {});
    await flush(env.t);
    vi.advanceTimersByTime(2 * HOUR);
    await env.t.mutation(internal.paypal.reconcileTick, {});
    await flush(env.t);

    expect((await getPayout(env.t, payoutId)).needsAttention).toBe(true);
    expect(subjects(paypal).filter((s) => s.includes("needs attention"))).toHaveLength(1);
  });
});

describe("protecting tutors from a hijacked account", () => {
  const setEmail = (env, paypalEmail) =>
    env.tutor.mutation(api.wallet.setPayoutMethod, { method: "paypal", paypalEmail });

  test("changing the address emails the tutor and pauses withdrawals for 48 hours", async () => {
    const env = await setup();
    await setEmail(env, "NEW@example.com");
    await flush(env.t);
    expect(subjects(paypal)).toContain("Your PayPal payout address was changed");
    const notice = paypal.emails.find((e) => e.subject.includes("address was changed"));
    expect(notice.to).toEqual(["tutor-login@example.com"]);

    await expect(env.tutor.mutation(api.wallet.requestPaypalPayout, {})).rejects.toThrow(
      "paused for 48 hours"
    );
    expect((await getEntry(env.t, env.entryId)).status).toBe("available");

    vi.advanceTimersByTime(47 * HOUR);
    await expect(env.tutor.mutation(api.wallet.requestPaypalPayout, {})).rejects.toThrow(
      "paused for 48 hours"
    );

    vi.advanceTimersByTime(HOUR + 1000);
    await withdraw(env);
    expect(paypal.payoutCalls.at(-1).body.items[0].receiver).toBe("new@example.com");
  });

  test("saving the same address again doesn't restart the pause", async () => {
    const env = await setup();
    await setEmail(env, "tutor@example.com");
    await flush(env.t);
    expect(subjects(paypal).some((s) => s.includes("address was changed"))).toBe(false);
    expect((await withdraw(env)).status).toBe("processing");
  });

  test("tutors who saved an address before this feature aren't paused", async () => {
    expect((await withdraw(await setup())).status).toBe("processing");
  });

  test("a payout keeps the address from when it was requested", async () => {
    const env = await setup();
    paypal.createResponses.push({ status: 500, body: {} });
    const { payoutId } = await withdraw(env);
    await setEmail(env, "attacker@example.com");

    vi.advanceTimersByTime(6 * 60 * 1000);
    await env.t.mutation(internal.paypal.reconcileTick, {});
    await flush(env.t);
    expect(paypal.payoutCalls.at(-1).body.items[0].receiver).toBe("tutor@example.com");
    expect((await getPayout(env.t, payoutId)).paypalEmail).toBe("tutor@example.com");
  });

  test("the wallet never shows a tutor PayPal's raw errors or admin flags", async () => {
    const env = await setup();
    paypal.createResponses.push({ status: 422, body: { name: "INSUFFICIENT_FUNDS", message: "low" } });
    await withdraw(env);

    const wallet = await env.tutor.query(api.wallet.mine, {});
    const [payout] = wallet.payouts;
    expect(payout.status).toBe("processing");
    for (const field of ["paypalError", "needsAttention", "paypalRejected", "paypalBatchId"]) {
      expect(payout).not.toHaveProperty(field);
    }
  });
});

describe("admin controls", () => {
  test("only admins can approve, retry, return, cancel or dismiss", async () => {
    const env = await setup({ cents: 60000 });
    const { payoutId } = await withdraw(env);
    const calls = [
      [api.admin.approvePayout, { payoutId }],
      [api.admin.retryPayout, { payoutId }],
      [api.admin.returnPayoutToTutor, { payoutId, note: "x" }],
      [api.admin.cancelUnclaimedPayout, { payoutId }],
      [api.admin.dismissPayoutAlert, { payoutId }],
    ];
    for (const [fn, args] of calls) {
      await expect(env.tutor.mutation(fn, args)).rejects.toThrow();
    }
    expect((await getPayout(env.t, payoutId)).status).toBe("requested");
    expect(paypal.payoutCalls).toHaveLength(0);
  });

  test("approving sends once, and a second click is refused", async () => {
    const env = await setup({ cents: 60000 });
    const { payoutId } = await withdraw(env);
    await env.admin.mutation(api.admin.approvePayout, { payoutId });
    await expect(env.admin.mutation(api.admin.approvePayout, { payoutId })).rejects.toThrow(
      "no longer pending"
    );
    await flush(env.t);
    expect(paypal.payoutCalls).toHaveLength(1);
    expect((await getPayout(env.t, payoutId)).approvedBy).toBe(env.adminId);
  });

  test("marking as already sent moves no money", async () => {
    const env = await setup({ cents: 60000 });
    const { payoutId } = await withdraw(env);
    await env.admin.mutation(api.admin.markPayoutPaid, { payoutId, reference: "HAND1" });
    await flush(env.t);
    expect(paypal.payoutCalls).toHaveLength(0);
    expect((await getPayout(env.t, payoutId)).status).toBe("paid");
  });

  test("flagged and unclaimed payouts appear on the admin page and in the badge", async () => {
    const low = await setup({ cents: 100 });
    paypal.createResponses.push({ status: 422, body: { name: "INSUFFICIENT_FUNDS" } });
    const { payoutId } = await withdraw(low);

    const rows = await low.admin.query(api.admin.payoutsNeedingAttention, {});
    expect(rows.map((row) => row._id)).toEqual([payoutId]);
    expect(rows[0].tutorName).toBe("Tess Tutor");
    expect(await low.admin.query(api.admin.pendingPayoutCount, {})).toBe(1);
  });

  test("the approval limit can be changed in settings", async () => {
    const env = await setup({ cents: 10000 });
    await env.admin.mutation(api.settings.update, {
      commissionPercent: 30,
      cancellationWindowHours: 12,
      confirmationWindowHours: 72,
      minNoticeHours: 2,
      payoutApprovalThresholdCents: 5000,
    });
    expect((await env.admin.query(api.settings.adminGet, {})).payoutApprovalThresholdCents).toBe(5000);
    expect((await withdraw(env)).status).toBe("requested");
  });
});

describe("reading PayPal's answers", () => {
  const classify = (status, body, priorSends = 0) =>
    classifyCreateResponse(status, body, { senderBatchId: "abc-1", priorSends });

  test.each([[500], [502], [503], [504], [401], [408], [409], [429]])(
    "HTTP %i is never treated as a refusal",
    (status) => {
      expect(classify(status, { name: "X" }).kind).toBe("retry");
    }
  );

  test("a previous request still running means try again", () => {
    expect(classify(400, { name: "PREVIOUS_REQUEST_IN_PROGRESS" }).kind).toBe("retry");
  });

  test("a duplicate without a usable link stays unknown", () => {
    const result = classify(400, {
      name: "USER_BUSINESS_ERROR",
      message: "sender_batch_id abc-1 already used",
      links: [{ href: "https://developer.paypal.com/docs/api/payments.payouts-batch/" }],
    });
    expect(result.kind).toBe("retry");
    expect(result.attention).toBe(true);
  });

  test("a first-time refusal is definite", () => {
    expect(classify(422, { name: "INSUFFICIENT_FUNDS" }).kind).toBe("rejected");
    expect(classify(403, { name: "AUTHORIZATION_ERROR" }).kind).toBe("rejected");
  });

  test("a batch id in a success response is required", () => {
    expect(classify(201, { batch_header: { payout_batch_id: "B1" } })).toEqual({
      kind: "accepted",
      batchId: "B1",
    });
    expect(classify(201, {}).kind).toBe("retry");
  });

  test("webhook events point to the right payout", () => {
    expect(
      payoutRefFromEvent({
        event_type: "PAYMENT.PAYOUTS-ITEM.FAILED",
        resource: { payout_batch_id: "B1", payout_item: { sender_item_id: "abc" } },
      })
    ).toEqual({ payoutRef: "abc", batchId: "B1" });
    expect(
      payoutRefFromEvent({
        event_type: "PAYMENT.PAYOUTSBATCH.DENIED",
        resource: {
          batch_header: {
            payout_batch_id: "B1",
            sender_batch_header: { sender_batch_id: "abc-2" },
          },
        },
      })
    ).toEqual({ payoutRef: "abc", batchId: "B1" });
    expect(payoutRefFromEvent({ event_type: "PAYMENT.SALE.COMPLETED", resource: {} })).toBeNull();
  });
});
