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

/**
 * Remove every credential Convex Auth hangs off a user — login accounts, OTP
 * codes, sessions and refresh tokens — so nobody can log in as them any more
 * and the email/provider ids are free for a fresh sign-up.
 */
export async function purgeAuthCredentials(ctx, user) {
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
}

/** Every row Convex Auth hangs off a user, so a delete leaves nothing dangling. */
async function deleteAuthUser(ctx, user) {
  await purgeAuthCredentials(ctx, user);
  await ctx.db.delete(user._id);
}

/**
 * Admin "delete": the user row must survive because lessons, balances,
 * reviews and messages reference it, but the person should be gone from the
 * system — no way to log in, and their email free to sign up again. So we
 * purge credentials and release the email (Convex Auth would otherwise link
 * the next sign-up with that email straight back to this dead account).
 * The old address is kept on `deletedEmail` so admins can still tell who this was.
 */
export async function releaseDeletedUser(ctx, user) {
  await purgeAuthCredentials(ctx, user);
  const patch = { status: "deleted", deletedAt: user.deletedAt ?? Date.now() };
  if (user.email !== undefined) {
    patch.deletedEmail = user.email;
    patch.email = undefined;
    patch.emailVerificationTime = undefined;
  }
  if (user.phone !== undefined) {
    patch.phone = undefined;
    patch.phoneVerificationTime = undefined;
  }
  await ctx.db.patch(user._id, patch);
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
 * Clears an abandoned, never-verified account for this email — or releases an
 * admin-deleted one still holding it — so the sign-up goes through as if it
 * were the first. Returns whether a *verified* account
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
      if (user.status === "deleted") {
        // Soft-deleted before we started releasing emails on delete: free it now.
        await releaseDeletedUser(ctx, user);
        reclaimed = true;
      } else if (await isReclaimable(ctx, user)) {
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
      // Released (admin-deleted) rows also have no verification time; skip them.
      .filter((q) =>
        q.and(q.lt(q.field("_creationTime"), cutoff), q.neq(q.field("status"), "deleted"))
      )
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
