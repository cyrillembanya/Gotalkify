import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();
auth.addHttpRoutes(http);

/* ------------------------- Stripe webhook (no SDK — V8) ----------------------- */

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Verify a Stripe-Signature header with Web Crypto (HMAC-SHA256). */
async function verifyStripeSignature(payload, header, secret) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => kv.split("=", 2))
  );
  const timestamp = Number(parts.t);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const signatures = header
    .split(",")
    .filter((kv) => kv.startsWith("v1="))
    .map((kv) => kv.slice(3));
  if (signatures.length === 0) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  for (const signature of signatures) {
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      hexToBytes(signature),
      new TextEncoder().encode(`${parts.t}.${payload}`)
    );
    if (valid) return true;
  }
  return false;
}

async function stripeGet(path) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
  });
  if (!res.ok) throw new Error(`Stripe API ${res.status}: ${await res.text()}`);
  return res.json();
}

http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Platform events (checkout, invoices) and Connect events (account.updated)
    // come from separate Stripe webhook endpoints, each with its own secret.
    const secrets = [
      process.env.STRIPE_WEBHOOK_SECRET,
      process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
    ].filter(Boolean);
    const payload = await request.text();
    if (secrets.length > 0) {
      const header = request.headers.get("Stripe-Signature");
      let ok = false;
      for (const secret of secrets) {
        if (await verifyStripeSignature(payload, header, secret)) {
          ok = true;
          break;
        }
      }
      if (!ok) return new Response("Invalid signature", { status: 400 });
    }

    const event = JSON.parse(payload);
    const object = event.data?.object ?? {};
    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const kind = object.metadata?.kind;
          if (kind === "trial") {
            await ctx.runMutation(internal.booking.fulfillTrial, {
              sessionId: object.id,
            });
          } else if (kind === "package") {
            await ctx.runMutation(internal.balances.fulfillPackage, {
              sessionId: object.id,
            });
          }
          // Subscriptions are credited on invoice.paid.
          break;
        }
        case "invoice.paid": {
          // API versions ≥2025 moved invoice.subscription into parent.*
          const subscriptionId =
            object.subscription ??
            object.parent?.subscription_details?.subscription;
          if (!subscriptionId) break;
          const subscription = await stripeGet(`/subscriptions/${subscriptionId}`);
          const meta = subscription.metadata ?? {};
          if (!meta.studentId || !meta.tutorId) break;
          // Newer API versions moved current_period_end onto subscription items.
          const periodEnd =
            subscription.current_period_end ??
            subscription.items?.data?.[0]?.current_period_end;
          await ctx.runMutation(internal.subscriptions.handleInvoicePaid, {
            stripeSubscriptionId: subscriptionId,
            stripeInvoiceId: object.id,
            studentId: meta.studentId,
            tutorId: meta.tutorId,
            hoursPerCycle: Number(meta.hoursPerCycle ?? 0),
            amountCents: object.amount_paid ?? 0,
            currentPeriodEnd: periodEnd ? periodEnd * 1000 : undefined,
          });
          break;
        }
        case "invoice.payment_failed": {
          const failedSubscriptionId =
            object.subscription ??
            object.parent?.subscription_details?.subscription;
          if (failedSubscriptionId) {
            await ctx.runMutation(internal.subscriptions.markPastDue, {
              stripeSubscriptionId: failedSubscriptionId,
            });
          }
          break;
        }
        case "customer.subscription.deleted": {
          await ctx.runMutation(internal.subscriptions.markCancelled, {
            stripeSubscriptionId: object.id,
          });
          break;
        }
        case "account.updated": {
          await ctx.runMutation(internal.tutors.updateConnectStatus, {
            accountId: object.id,
            payoutsEnabled: !!object.payouts_enabled,
          });
          break;
        }
        default:
          break;
      }
    } catch (error) {
      console.error(`[stripe webhook] ${event.type}: ${error.message}`);
      return new Response("Webhook handler error", { status: 500 });
    }
    return new Response(null, { status: 200 });
  }),
});

export default http;
