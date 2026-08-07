import { getAuthUserId } from "@convex-dev/auth/server";

export const LESSON_MINUTES = 60;
export const LESSON_MS = LESSON_MINUTES * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export const DEFAULT_SETTINGS = {
  commissionPercent: 20,
  cancellationWindowHours: 12,
  confirmationWindowHours: 72,
  minNoticeHours: 2,
};

/** Current user document, or null. */
export async function currentUser(ctx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  const user = await ctx.db.get(userId);
  if (!user || user.status === "deleted") return null;
  return user;
}

export async function requireUser(ctx) {
  const user = await currentUser(ctx);
  if (!user) throw new Error("Not authenticated");
  if (user.status === "suspended") throw new Error("Account suspended");
  return user;
}

export async function requireRole(ctx, ...roles) {
  const user = await requireUser(ctx);
  if (!roles.includes(user.role)) throw new Error("Not authorized");
  return user;
}

export async function requireAdmin(ctx) {
  return requireRole(ctx, "admin");
}

/** Platform settings with defaults applied. */
export async function getSettings(ctx) {
  const doc = await ctx.db.query("settings").first();
  return { ...DEFAULT_SETTINGS, ...(doc ?? {}) };
}

/** Approved tutor profile for a tutor userId, or throw. */
export async function getApprovedTutorProfile(ctx, tutorUserId) {
  const profile = await ctx.db
    .query("tutorProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", tutorUserId))
    .first();
  if (!profile || profile.approvalStatus !== "approved") {
    throw new Error("Tutor not found");
  }
  return profile;
}

/** Statuses that occupy a time slot. */
export const ACTIVE_LESSON_STATUSES = ["scheduled"];

export function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/** All lessons for `field` ("tutorId"|"studentId") overlapping [startUTC, endUTC). */
export async function findConflicts(ctx, field, userId, startUTC, endUTC) {
  const index = field === "tutorId" ? "by_tutor_start" : "by_student_start";
  const candidates = await ctx.db
    .query("lessons")
    .withIndex(index, (q) =>
      q.eq(field, userId).gt("startUTC", startUTC - LESSON_MS).lt("startUTC", endUTC)
    )
    .collect();
  return candidates.filter(
    (l) =>
      ACTIVE_LESSON_STATUSES.includes(l.status) &&
      overlaps(l.startUTC, l.endUTC, startUTC, endUTC)
  );
}

/** Get or create the per student–tutor hour balance. */
export async function getBalance(ctx, studentId, tutorId) {
  return ctx.db
    .query("hourBalances")
    .withIndex("by_student_tutor", (q) =>
      q.eq("studentId", studentId).eq("tutorId", tutorId)
    )
    .first();
}

export async function creditMinutes(
  ctx,
  { studentId, tutorId, minutes, rateCents, reason, lessonId, purchaseId, note }
) {
  let balance = await getBalance(ctx, studentId, tutorId);
  let balanceId;
  if (!balance) {
    balanceId = await ctx.db.insert("hourBalances", {
      studentId,
      tutorId,
      minutesRemaining: minutes,
      purchaseRateCents: rateCents,
    });
  } else {
    balanceId = balance._id;
    const patch = { minutesRemaining: balance.minutesRemaining + minutes };
    // New purchases reprice the ledger at the rate they were bought at.
    if (rateCents && (reason === "purchase" || reason === "subscription_renewal")) {
      patch.purchaseRateCents = rateCents;
    }
    await ctx.db.patch(balanceId, patch);
  }
  await ctx.db.insert("balanceEntries", {
    balanceId,
    deltaMinutes: minutes,
    reason,
    lessonId,
    purchaseId,
    note,
    createdAt: Date.now(),
  });
  return balanceId;
}

export async function debitMinutes(ctx, { studentId, tutorId, minutes, lessonId }) {
  const balance = await getBalance(ctx, studentId, tutorId);
  if (!balance || balance.minutesRemaining < minutes) {
    throw new Error("Insufficient hour balance for this tutor");
  }
  await ctx.db.patch(balance._id, {
    minutesRemaining: balance.minutesRemaining - minutes,
  });
  await ctx.db.insert("balanceEntries", {
    balanceId: balance._id,
    deltaMinutes: -minutes,
    reason: "booking",
    lessonId,
    createdAt: Date.now(),
  });
  return balance;
}

export function fmtUSD(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

/** "YYYY-MM-DD" for a ms timestamp, in UTC. */
export function utcDateString(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}
