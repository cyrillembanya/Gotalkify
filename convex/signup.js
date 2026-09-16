import { mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { DAY_MS } from "./lib";

/**
 * Convex Auth inserts the `users` + `authAccounts` rows at sign-up, *before*
 * the email OTP is confirmed. Anyone who closes the tab at the code step leaves
 * an unverified account behind, and their next sign-up attempt with a different
 * password fails with "already exists" — the email looks burned.
 *
 * Nobody has proven ownership of an unverified email, so such an account holds
 * nothing worth keeping and can safely be recreated by whoever verifies next.
 */

/** Every row Convex Auth hangs off a user, so a delete leaves nothing dangling. */
async function deleteAuthUser(ctx, user) {
  const accounts = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", user._id))
    .collect();
  for (const account of accounts) {
    const codes = await ctx.db
      .query("authVerificationCodes")
      .withIndex("accountId", (q) => q.eq("accountId", account._id))
      .collect();
    for (const code of codes) await ctx.db.delete(code._id);
    await ctx.db.delete(account._id);
  }
  const sessions = await ctx.db
    .query("authSessions")
    .withIndex("userId", (q) => q.eq("userId", user._id))
    .collect();
  for (const session of sessions) {
    const tokens = await ctx.db
      .query("authRefreshTokens")
      .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
      .collect();
    for (const token of tokens) await ctx.db.delete(token._id);
    await ctx.db.delete(session._id);
  }
  await ctx.db.delete(user._id);
}

/**
 * An account is reclaimable only when the email was never verified and the
 * password provider is its sole login — an OAuth-linked user is never touched,
 * whatever its verification flag says.
 */
async function isReclaimable(ctx, user) {
  if (user.emailVerificationTime !== undefined) return false;
  const accounts = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", user._id))
    .collect();
  return accounts.length > 0 && accounts.every((a) => a.provider === "password");
}

/**
 * Called by the sign-up forms right before `signIn("password", { flow: "signUp" })`.
 * Clears an abandoned, never-verified account for this email so the sign-up
 * goes through as if it were the first. Returns whether a *verified* account
 * already exists so the form can point at login / password reset instead of
 * relying on the (production-redacted) error message from the auth action.
 */
export const reclaimUnverifiedAccount = mutation({
  args: { email: v.string() },
  handler: async (ctx, { email: raw }) => {
    const email = raw.trim().toLowerCase();
    if (!email) return { exists: false, reclaimed: false };
    // Older rows may have been stored with the original casing.
    const users = [
      ...(await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", email))
        .collect()),
      ...(raw.trim() !== email
        ? await ctx.db
            .query("users")
            .withIndex("email", (q) => q.eq("email", raw.trim()))
            .collect()
        : []),
    ];
    let reclaimed = false;
    let exists = false;
    for (const user of users) {
      if (await isReclaimable(ctx, user)) {
        await deleteAuthUser(ctx, user);
        reclaimed = true;
      } else {
        exists = true;
      }
    }
    return { exists, reclaimed };
  },
});

/** Cron: drop sign-ups abandoned at the OTP step more than a day ago. */
export const sweepUnverifiedTick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - DAY_MS;
    const stale = await ctx.db
      .query("users")
      .withIndex("by_emailVerificationTime", (q) => q.eq("emailVerificationTime", undefined))
      .filter((q) => q.lt(q.field("_creationTime"), cutoff))
      .take(100);
    let removed = 0;
    for (const user of stale) {
      if (await isReclaimable(ctx, user)) {
        await deleteAuthUser(ctx, user);
        removed++;
      }
    }
    if (removed > 0) console.log(`Swept ${removed} unverified sign-up(s)`);
  },
});
