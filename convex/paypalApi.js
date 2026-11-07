/**
 * PayPal REST client for tutor payouts, plus the rules for reading PayPal's
 * answers. There are no Convex functions here, so both the actions in paypal.js
 * and the webhook route in http.js can share it.
 *
 * The one rule everything else depends on: after a timeout or a 5xx we do not
 * know whether PayPal took the money. Those outcomes are never treated as a
 * failure. They are retried with the same sender_batch_id, which PayPal refuses
 * to pay twice within 30 days.
 */

/** Anything but an explicit "live" uses sandbox, so a typo can't move real money. */
function baseUrl() {
  return process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

export function paypalConfigured() {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

/** Changes only after a definite refusal, when PayPal has moved no money. */
export function senderBatchId(payoutId, attempt) {
  return `${payoutId}-${attempt}`;
}

export function centsToValue(cents) {
  return (Math.round(cents) / 100).toFixed(2);
}

async function accessToken() {
  const credentials = btoa(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  );
  const res = await fetch(`${baseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`PayPal sign-in failed (HTTP ${res.status}). Check the PayPal API credentials.`);
  }
  const body = await res.json();
  return body.access_token;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/** Leaves out PayPal's per-request debug ids, which would make each message unique. */
function describeError(body, status) {
  const name = body?.name ?? `HTTP ${status}`;
  const detail = body?.details?.[0]?.issue ?? body?.message;
  return (detail ? `${name}: ${detail}` : name).slice(0, 500);
}

/** The original batch id from the link PayPal includes on a duplicate error. */
function batchIdFromLinks(links) {
  for (const link of links ?? []) {
    const match = /\/v1\/payments\/payouts\/([A-Za-z0-9]+)(?:[/?#]|$)/.exec(link?.href ?? "");
    if (match) return match[1];
  }
  return null;
}

const RETRYABLE_STATUSES = new Set([401, 408, 409, 425, 429]);

/**
 * Turns the response to a create-payout call into one of:
 *  - accepted: PayPal has the batch. It still isn't paid until the item succeeds.
 *  - rejected: PayPal definitely refused it and moved no money.
 *  - retry: the outcome is unknown or temporary, so resend with the same id.
 */
export function classifyCreateResponse(status, body, { senderBatchId: batchKey, priorSends }) {
  if (status >= 200 && status < 300) {
    const batchId = body?.batch_header?.payout_batch_id;
    if (batchId) return { kind: "accepted", batchId };
    return {
      kind: "retry",
      attention: true,
      message: "PayPal accepted the payout but returned no batch id.",
    };
  }

  const errorName = body?.name ?? `HTTP_${status}`;
  const message = describeError(body, status);

  if (
    status >= 500 ||
    RETRYABLE_STATUSES.has(status) ||
    errorName === "PREVIOUS_REQUEST_IN_PROGRESS"
  ) {
    return { kind: "retry", errorName, message };
  }

  // The answer we get when an earlier try did go through: adopt that batch
  // instead of treating it as a failure, or the tutor would be paid twice.
  const batchId = batchIdFromLinks(body?.links);
  if (batchId) return { kind: "accepted", batchId };

  const raw = JSON.stringify(body ?? {});
  const mentionsBatch =
    raw.toLowerCase().includes("sender_batch_id") || raw.includes(batchKey);
  if (mentionsBatch || priorSends > 0) {
    // A refusal only proves no money moved on the first use of an id. After an
    // unknown outcome, the money may already have gone with the earlier try.
    return {
      kind: "retry",
      attention: true,
      errorName,
      message: `${message} (An earlier try had no clear answer, so this may already be paid. Check PayPal before doing anything by hand.)`,
    };
  }

  return { kind: "rejected", errorName, message };
}

/** Never throws: a failure here means the outcome is unknown, which is a retry. */
export async function createPayout({ payoutId, senderBatchId: batchKey, amountCents, receiver, priorSends }) {
  try {
    const token = await accessToken();
    const res = await fetch(`${baseUrl()}/v1/payments/payouts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": batchKey,
      },
      body: JSON.stringify({
        sender_batch_header: {
          sender_batch_id: batchKey,
          recipient_type: "EMAIL",
          email_subject: "You have a payout from GoTalkify",
          email_message: "Your GoTalkify lesson earnings have been sent to your PayPal account.",
        },
        items: [
          {
            recipient_type: "EMAIL",
            amount: { value: centsToValue(amountCents), currency: "USD" },
            receiver,
            note: "GoTalkify lesson earnings",
            sender_item_id: payoutId,
          },
        ],
      }),
    });
    const text = await res.text();
    return classifyCreateResponse(res.status, parseJson(text), {
      senderBatchId: batchKey,
      priorSends,
    });
  } catch (error) {
    return { kind: "retry", message: `Couldn't reach PayPal: ${error.message}`.slice(0, 500) };
  }
}

export async function getBatch(batchId) {
  const token = await accessToken();
  const res = await fetch(
    `${baseUrl()}/v1/payments/payouts/${encodeURIComponent(batchId)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return { ok: res.ok, status: res.status, body: parseJson(await res.text()) };
}

export async function cancelItem(itemId) {
  const token = await accessToken();
  const res = await fetch(
    `${baseUrl()}/v1/payments/payouts-item/${encodeURIComponent(itemId)}/cancel`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    }
  );
  return { ok: res.ok, status: res.status, body: parseJson(await res.text()) };
}

/**
 * Asks PayPal whether a webhook is genuine. Throws only when PayPal can't answer,
 * so the route can reply with an error and PayPal delivers the event again.
 */
export async function verifyWebhookSignature(headers, rawBody) {
  const fields = {
    auth_algo: headers.get("paypal-auth-algo"),
    cert_url: headers.get("paypal-cert-url"),
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"),
    webhook_id: process.env.PAYPAL_WEBHOOK_ID,
  };
  if (Object.values(fields).some((value) => !value)) return false;

  // PayPal checks the event's exact bytes, and re-serialising parsed JSON can
  // change them, so the raw body is spliced in as received.
  const body = `${JSON.stringify(fields).slice(0, -1)},"webhook_event":${rawBody}}`;
  const token = await accessToken();
  const res = await fetch(`${baseUrl()}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body,
  });
  if (res.status >= 500) throw new Error(`PayPal verification unavailable (HTTP ${res.status})`);
  if (!res.ok) {
    console.error(`[paypal webhook] verification refused (HTTP ${res.status})`);
    return false;
  }
  const result = await res.json();
  return result.verification_status === "SUCCESS";
}

/** Which of our payouts a webhook event is about, or null if it isn't one of ours. */
export function payoutRefFromEvent(event) {
  const type = event?.event_type ?? "";
  const resource = event?.resource ?? {};
  if (type.startsWith("PAYMENT.PAYOUTS-ITEM.")) {
    const payoutRef = resource.payout_item?.sender_item_id;
    const batchId = resource.payout_batch_id;
    return payoutRef || batchId ? { payoutRef, batchId } : null;
  }
  if (type.startsWith("PAYMENT.PAYOUTSBATCH.")) {
    const header = resource.batch_header;
    const payoutRef = header?.sender_batch_header?.sender_batch_id?.split("-")[0];
    const batchId = header?.payout_batch_id;
    return payoutRef || batchId ? { payoutRef, batchId } : null;
  }
  return null;
}

/**
 * Problems with the tutor's PayPal account, worded for the tutor. These send the
 * money back to their balance. Anything not listed is treated as our problem
 * (no funds, account limits, new error names): the payout stays locked and an
 * admin is alerted, so a tutor is never told to fix something they can't.
 */
const RECIPIENT_REASONS = {
  INVALID_EMAIL: "PayPal says this email address isn't valid. Please check it and try again.",
  INVALID_EMAIL_ID: "PayPal says this email address isn't valid. Please check it and try again.",
  RECEIVER_UNREGISTERED: "There's no PayPal account at this email address. Please check it or sign up with PayPal, then try again.",
  RECEIVER_UNCONFIRMED: "The PayPal account at this address hasn't confirmed its email. Please confirm it with PayPal, then try again.",
  RECEIVER_ACCOUNT_LOCKED: "The PayPal account at this address is locked or inactive. Please resolve it with PayPal or use a different address.",
  RECEIVER_ACCOUNT_LIMITATION: "The PayPal account at this address is limited. Please resolve it with PayPal or use a different address.",
  RECEIVER_ACCOUNT_NOT_ELIGIBLE: "This PayPal account can't receive this payout. Please contact PayPal or use a different address.",
  RECEIVER_ACCOUNT_UNVERIFIED: "This PayPal account needs to be verified before it can receive this payout. Please verify it with PayPal or use a different address.",
  UNVERIFIED_RECIPIENT_NOT_SUPPORTED: "This PayPal account needs to be verified before it can receive this payout. Please verify it with PayPal or use a different address.",
  RECEIVER_COUNTRY_NOT_ALLOWED: "PayPal doesn't allow payouts to this account's country. Please use a different payout method.",
  RECEIVER_STATE_RESTRICTED: "PayPal doesn't allow payouts to this account's state or region. Please use a different payout method.",
  CLOSED_MARKET: "This PayPal account can't receive payouts from other countries. Please use a different address or payout method.",
  GAMER_FAILED_COUNTRY_OF_RESIDENCE_CHECK: "PayPal doesn't allow payouts to this account's country. Please use a different payout method.",
  RECEIVER_REFUSED: "The PayPal account at this address declined the payment. Please check its settings or use a different address.",
  REFUSED_RECEIVER_REFUSED: "The PayPal account at this address declined the payment. Please check its settings or use a different address.",
  FRIENDS_ONLY: "The PayPal account at this address declined the payment. Please check its settings or use a different address.",
  RECEIVER_YOUTH_ACCOUNT: "PayPal doesn't allow payouts to youth accounts. Please use a different address.",
  CURRENCY_NOT_SUPPORTED_FOR_RECEIVER: "This PayPal account can't receive US dollars. Please use a different address.",
  RECEIVING_LIMIT_EXCEEDED: "This PayPal account has reached its receiving limit. Please resolve it with PayPal or use a different address.",
  SELF_PAY_NOT_ALLOWED: "This address belongs to GoTalkify's own PayPal account. Please enter your own PayPal address.",
};

export function recipientReason(errorName) {
  return RECIPIENT_REASONS[errorName] ?? null;
}

const UNDELIVERED_REASONS = {
  RETURNED: "PayPal returned this payout because it wasn't claimed. Please check your PayPal address and request the withdrawal again.",
  CANCELED: "This unclaimed payout was cancelled. Please check your PayPal address and request the withdrawal again.",
  REFUNDED: "The PayPal account that received this payout refunded it, so the amount is back in your balance.",
  REVERSED: "PayPal reversed this payout, so the amount is back in your balance.",
  BLOCKED: "PayPal blocked this payout. Please contact PayPal or use a different payout method.",
};

/** The tutor-facing reason for an item whose money did not stay delivered. */
export function undeliveredReason(itemStatus, errorName) {
  return (
    recipientReason(errorName) ??
    UNDELIVERED_REASONS[itemStatus] ??
    "PayPal couldn't deliver this payout. Please check your PayPal address and try again."
  );
}
