import { mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  requireUser,
  getSettings,
  getApprovedTutorProfile,
  getBalance,
  debitMinutes,
  findConflicts,
  newRoomId,
  LESSON_MINUTES,
  LESSON_MS,
  HOUR_MS,
  DAY_MS,
} from "./lib";
import { computeSlots } from "./availability";
import { safeZone, sameLocalTimeWeeksLater } from "./tz";
import { ensureConversation } from "./messages";
import { sendLessonBooked } from "./notify";

const MAX_RECURRING_WEEKS = 26;

/** Throw unless `startUTC` is a valid bookable slot for the tutor. */
async function assertSlotAvailable(ctx, tutorId, startUTC) {
  const now = Date.now();
  if (startUTC <= now) throw new Error("This time is in the past");
  const days = Math.min(Math.ceil((startUTC + LESSON_MS - now) / DAY_MS) + 1, 200);
  const available = await computeSlots(ctx, tutorId, now, days);
  if (!available.includes(startUTC)) {
    throw new Error("This time slot is no longer available");
  }
}

async function createLessonDoc(ctx, { studentId, tutorId, startUTC, type, priceCents, recurringGroupId }) {
  const lesson = {
    studentId,
    tutorId,
    startUTC,
    endUTC: startUTC + LESSON_MS,
    type,
    status: "scheduled",
    priceCents,
    recurringGroupId,
    // Every lesson gets its own unguessable classroom token up front, so the
    // "Join the class" link is on both dashboards the moment it is booked.
    roomId: newRoomId(),
  };
  const lessonId = await ctx.db.insert("lessons", lesson);
  await sendLessonBooked(ctx, { ...lesson, _id: lessonId });
  return lessonId;
}

/**
 * Book one lesson (or a weekly recurring series) with prepaid hours.
 * Atomic: slot free + balance sufficient are checked in this transaction.
 */
export const book = mutation({
  args: {
    tutorId: v.id("users"),
    startUTC: v.number(),
    recurring: v.optional(v.boolean()),
  },
  handler: async (ctx, { tutorId, startUTC, recurring }) => {
    const student = await requireUser(ctx);
    await getApprovedTutorProfile(ctx, tutorId);

    const balance = await getBalance(ctx, student._id, tutorId);
    if (!balance || balance.minutesRemaining < LESSON_MINUTES) {
      throw new Error("No prepaid hours with this tutor — buy hours first");
    }

    // Student must be free too.
    const studentConflicts = await findConflicts(
      ctx, "studentId", student._id, startUTC, startUTC + LESSON_MS
    );
    if (studentConflicts.length > 0) {
      throw new Error("You already have a lesson at this time");
    }
    await assertSlotAvailable(ctx, tutorId, startUTC);

    const priceCents = balance.purchaseRateCents;

    const booked = [];
    const first = await createLessonDoc(ctx, {
      studentId: student._id,
      tutorId,
      startUTC,
      type: "regular",
      priceCents,
    });
    // Group id for the weekly series = the first lesson's id (deterministic).
    const recurringGroupId = recurring ? String(first) : undefined;
    if (recurringGroupId) {
      await ctx.db.patch(first, { recurringGroupId });
    }
    await debitMinutes(ctx, {
      studentId: student._id,
      tutorId,
      minutes: LESSON_MINUTES,
      lessonId: first,
    });
    booked.push(startUTC);

    if (recurring) {
      // Book the same weekly slot as far ahead as the balance covers. "Same
      // slot" means the same wall-clock time in the tutor's zone — a series
      // booked for 18:00 stays at 18:00 for them when the clocks change,
      // instead of drifting to 17:00 or 19:00 for half the year.
      const tutor = await ctx.db.get(tutorId);
      const tutorZone = safeZone(tutor?.timezone);
      const horizon = await computeSlots(
        ctx, tutorId, Date.now(), MAX_RECURRING_WEEKS * 7 + 1
      );
      const horizonSet = new Set(horizon);
      for (let week = 1; week <= MAX_RECURRING_WEEKS; week++) {
        const current = await getBalance(ctx, student._id, tutorId);
        if (!current || current.minutesRemaining < LESSON_MINUTES) break;
        const weekStart = sameLocalTimeWeeksLater(startUTC, tutorZone, week);
        if (!horizonSet.has(weekStart)) continue; // slot taken/unavailable that week
        const conflicts = await findConflicts(
          ctx, "studentId", student._id, weekStart, weekStart + LESSON_MS
        );
        if (conflicts.length > 0) continue;
        const lessonId = await createLessonDoc(ctx, {
          studentId: student._id,
          tutorId,
          startUTC: weekStart,
          type: "regular",
          priceCents,
          recurringGroupId,
        });
        await debitMinutes(ctx, {
          studentId: student._id,
          tutorId,
          minutes: LESSON_MINUTES,
          lessonId,
        });
        booked.push(weekStart);
      }
    }

    await ensureConversation(ctx, student._id, tutorId);
    return { booked: booked.length, times: booked };
  },
});

/**
 * Stripe webhook → trial payment completed. Creates the trial lesson.
 * Idempotent on the purchase status.
 */
export const fulfillTrial = internalMutation({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    const purchase = await ctx.db
      .query("purchases")
      .withIndex("by_session", (q) => q.eq("stripeSessionId", sessionId))
      .first();
    if (!purchase || purchase.kind !== "trial") return;
    if (purchase.status !== "pending") return; // already handled

    const startUTC = purchase.lessonStartUTC;
    const conflicts = await findConflicts(
      ctx, "tutorId", purchase.tutorId, startUTC, startUTC + LESSON_MS
    );
    if (conflicts.length > 0) {
      // Paid, but the slot was taken meanwhile — flag for admin resolution.
      await ctx.db.patch(purchase._id, { status: "conflict" });
      return;
    }

    await ctx.db.patch(purchase._id, { status: "paid" });
    const lesson = {
      studentId: purchase.studentId,
      tutorId: purchase.tutorId,
      startUTC,
      endUTC: startUTC + LESSON_MS,
      type: "trial",
      status: "scheduled",
      priceCents: purchase.amountCents, // 100% platform — commission set on release
      roomId: newRoomId(),
    };
    const lessonId = await ctx.db.insert("lessons", lesson);
    await ensureConversation(ctx, purchase.studentId, purchase.tutorId);
    await sendLessonBooked(ctx, { ...lesson, _id: lessonId });

    const student = await ctx.db.get(purchase.studentId);
    const tutor = await ctx.db.get(purchase.tutorId);
    if (student?.email) {
      await ctx.scheduler.runAfter(0, internal.emails.sendTemplate, {
        to: [student.email],
        template: "paymentReceipt",
        params: {
          recipientName: student.name ?? "there",
          description: `Trial lesson with ${tutor?.name ?? "your tutor"}`,
          amountCents: purchase.amountCents,
        },
      });
    }
  },
});

/**
 * Validation used by the Stripe action before creating a trial checkout.
 * Returns rate & existing-trial info; throws on an unbookable slot.
 */
export const validateTrial = internalMutation({
  args: {
    studentId: v.id("users"),
    tutorId: v.id("users"),
    startUTC: v.number(),
  },
  handler: async (ctx, { studentId, tutorId, startUTC }) => {
    const profile = await getApprovedTutorProfile(ctx, tutorId);
    // One trial per student–tutor pair.
    const previous = await ctx.db
      .query("lessons")
      .withIndex("by_student_start", (q) => q.eq("studentId", studentId))
      .collect();
    if (previous.some((l) => l.tutorId === tutorId && l.type === "trial" &&
        !["cancelled_tutor", "noshow_tutor"].includes(l.status))) {
      throw new Error("You already had a trial with this tutor — buy hours instead");
    }
    await assertSlotAvailable(ctx, tutorId, startUTC);
    // Record the pending purchase; the sessionId is attached by the action.
    const purchaseId = await ctx.db.insert("purchases", {
      studentId,
      tutorId,
      kind: "trial",
      hours: 1,
      amountCents: profile.hourlyRateCents,
      status: "pending",
      lessonStartUTC: startUTC,
      createdAt: Date.now(),
    });
    return {
      purchaseId,
      amountCents: profile.hourlyRateCents,
      tutorName: profile.name,
    };
  },
});

export const attachSessionToPurchase = internalMutation({
  args: { purchaseId: v.id("purchases"), sessionId: v.string() },
  handler: async (ctx, { purchaseId, sessionId }) => {
    await ctx.db.patch(purchaseId, { stripeSessionId: sessionId });
  },
});
