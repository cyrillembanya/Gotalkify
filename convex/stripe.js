"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import Stripe from "stripe";

function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new ConvexError("Stripe is not configured (STRIPE_SECRET_KEY missing)");
  return new Stripe(key);
}

const site = () => process.env.SITE_URL ?? "http://localhost:3000";

async function requireAuthedUser(ctx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("Not authenticated");
  const user = await ctx.runQuery(internal.users.getById, { userId });
  if (!user || user.status === "suspended" || user.status === "deleted") {
    throw new ConvexError("Account not active");
  }
  return user;
}

/**
 * Trial lesson checkout — charged at the tutor's hourly rate,
 * 100% kept by the platform (§4.1).
 */
export const createTrialCheckout = action({
  args: { tutorId: v.id("users"), startUTC: v.number() },
  handler: async (ctx, { tutorId, startUTC }) => {
    const user = await requireAuthedUser(ctx);
    const { purchaseId, amountCents, tutorName } = await ctx.runMutation(
      internal.booking.validateTrial,
      { studentId: user._id, tutorId, startUTC }
    );
    const stripe = stripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: `Trial lesson with ${tutorName}`,
              description: "60-minute one-on-one trial lesson",
            },
          },
          quantity: 1,
        },
      ],
      metadata: { kind: "trial" },
      success_url: `${site()}/dashboard/lessons?checkout=success`,
      cancel_url: `${site()}/tutors?checkout=cancelled`,
    });
    await ctx.runMutation(internal.booking.attachSessionToPurchase, {
      purchaseId,
      sessionId: session.id,
    });
    return { url: session.url };
  },
});

/** One-time hour package (5/10h) for a specific tutor (§4.2 Option B). */
export const createPackageCheckout = action({
  args: { tutorId: v.id("users"), hours: v.number() },
  handler: async (ctx, { tutorId, hours }) => {
    const user = await requireAuthedUser(ctx);
    if (![5, 10].includes(hours)) throw new ConvexError("Packages are 5 or 10 hours");
    const profile = await ctx.runQuery(internal.tutors.profileByUserId, {
      userId: tutorId,
    });
    if (!profile || profile.approvalStatus !== "approved") {
      throw new ConvexError("Tutor not found");
    }
    const amountCents = profile.hourlyRateCents * hours;
    const purchaseId = await ctx.runMutation(internal.balances.createPendingPurchase, {
      studentId: user._id,
      tutorId,
      kind: "package",
      hours,
      amountCents,
    });
    const stripe = stripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: `${hours}-hour package with ${profile.name}`,
              description: `One-on-one lessons at $${(profile.hourlyRateCents / 100).toFixed(2)}/h`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: { kind: "package" },
      success_url: `${site()}/dashboard?checkout=success`,
      cancel_url: `${site()}/dashboard?checkout=cancelled`,
    });
    await ctx.runMutation(internal.balances.attachSession, {
      purchaseId,
      sessionId: session.id,
    });
    return { url: session.url };
  },
});

/** 28-day subscription crediting hours each cycle (§4.2 Option A). */
export const createSubscriptionCheckout = action({
  args: { tutorId: v.id("users"), hoursPerCycle: v.number() },
  handler: async (ctx, { tutorId, hoursPerCycle }) => {
    const user = await requireAuthedUser(ctx);
    if (![2, 4, 8].includes(hoursPerCycle)) {
      throw new ConvexError("Plans are 2, 4 or 8 hours per cycle");
    }
    const profile = await ctx.runQuery(internal.tutors.profileByUserId, {
      userId: tutorId,
    });
    if (!profile || profile.approvalStatus !== "approved") {
      throw new ConvexError("Tutor not found");
    }
    const amountCents = profile.hourlyRateCents * hoursPerCycle;
    const stripe = stripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: user.email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            recurring: { interval: "day", interval_count: 28 },
            product_data: {
              name: `${hoursPerCycle}h every 28 days with ${profile.name}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: { kind: "subscription" },
      subscription_data: {
        metadata: {
          studentId: user._id,
          tutorId,
          hoursPerCycle: String(hoursPerCycle),
        },
      },
      success_url: `${site()}/dashboard?checkout=success`,
      cancel_url: `${site()}/dashboard?checkout=cancelled`,
    });
    return { url: session.url };
  },
});

/** Cancel at period end — remaining hours stay usable (§4.2). */
export const cancelSubscription = action({
  args: { stripeSubscriptionId: v.string() },
  handler: async (ctx, { stripeSubscriptionId }) => {
    const user = await requireAuthedUser(ctx);
    const subscription = await ctx.runQuery(internal.subscriptions.getByStripeId, {
      stripeSubscriptionId,
    });
    if (!subscription || subscription.studentId !== user._id) {
      throw new ConvexError("Subscription not found");
    }
    const stripe = stripeClient();
    await stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
    return { ok: true };
  },
});

/** Stripe Connect Express onboarding for tutor payouts (§4.5). */
export const createConnectOnboardingLink = action({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuthedUser(ctx);
    if (user.role !== "tutor") throw new ConvexError("Tutors only");
    const profile = await ctx.runQuery(internal.tutors.profileByUserId, {
      userId: user._id,
    });
    if (!profile) throw new ConvexError("Tutor profile not found");
    const stripe = stripeClient();
    let accountId = profile.stripeConnectAccountId;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: user.email,
        capabilities: { transfers: { requested: true } },
      });
      accountId = account.id;
      await ctx.runMutation(internal.tutors.setConnectAccountId, {
        profileId: profile._id,
        accountId,
      });
    }
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${site()}/dashboard/wallet?connect=refresh`,
      return_url: `${site()}/dashboard/wallet?connect=done`,
      type: "account_onboarding",
    });
    return { url: link.url };
  },
});

/** Withdraw the full available balance to the tutor's Connect account. */
export const requestWithdrawal = action({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuthedUser(ctx);
    if (user.role !== "tutor") throw new ConvexError("Tutors only");
    const profile = await ctx.runQuery(internal.tutors.profileByUserId, {
      userId: user._id,
    });
    if (!profile?.stripeConnectAccountId || !profile.stripeConnectOnboarded) {
      throw new ConvexError("Complete Stripe Connect onboarding first");
    }
    const { payoutId, amountCents } = await ctx.runMutation(
      internal.wallet.preparePayout,
      { tutorId: user._id }
    );
    const stripe = stripeClient();
    try {
      const transfer = await stripe.transfers.create({
        amount: amountCents,
        currency: "usd",
        destination: profile.stripeConnectAccountId,
        description: "GoTalkify lesson earnings",
      });
      await ctx.runMutation(internal.wallet.finalizePayout, {
        payoutId,
        stripeTransferId: transfer.id,
      });
      if (user.email) {
        await ctx.runAction(internal.emails.sendTemplate, {
          to: [user.email],
          template: "payoutProcessed",
          params: { recipientName: user.name ?? "there", amountCents },
        });
      }
      return { ok: true, amountCents };
    } catch (error) {
      await ctx.runMutation(internal.wallet.revertPayout, { payoutId });
      throw new ConvexError(`Withdrawal failed: ${error.message}`);
    }
  },
});
