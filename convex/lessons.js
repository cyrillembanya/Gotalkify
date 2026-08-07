import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  requireUser,
  getSettings,
  creditMinutes,
  findConflicts,
  LESSON_MINUTES,
  LESSON_MS,
  HOUR_MS,
} from "./lib";
import { computeSlots } from "./availability";

/* ---------------------------------- helpers ---------------------------------- */

async function withNames(ctx, lesson) {
  const student = await ctx.db.get(lesson.studentId);
  const tutor = await ctx.db.get(lesson.tutorId);
  return {
    ...lesson,
    studentName: student?.name ?? "Student",
    tutorName: tutor?.name ?? "Tutor",
  };
}

/** Is this lesson awaiting confirmation that will pay the tutor? */
export function awaitingPayout(lesson) {
  if (lesson.payoutReleased) return false;
  if (lesson.type !== "regular") return false;
  return (
    lesson.status === "completed" ||
    lesson.status === "noshow_student" ||
    (lesson.status === "cancelled_student" && lesson.lateCancel === true)
  );
}

/**
 * Release escrowed money for a lesson: platform commission is deducted and
 * the remainder is credited to the tutor's wallet as `available`.
 * Trials release nothing to the tutor (100% platform).
 */
export async function releaseEarnings(ctx, lesson, confirmedBy) {
  if (lesson.payoutReleased) return;
  const settings = await getSettings(ctx);
  const patch = {
    payoutReleased: true,
    confirmedAt: Date.now(),
    confirmedBy,
  };
  if (lesson.status === "completed") patch.status = "confirmed";

  if (lesson.type === "trial") {
    patch.commissionCents = lesson.priceCents; // platform keeps 100%
  } else {
    const commissionCents = Math.round(
      (lesson.priceCents * settings.commissionPercent) / 100
    );
    patch.commissionCents = commissionCents;
    const tutorShare = lesson.priceCents - commissionCents;
    if (tutorShare > 0) {
      await ctx.db.insert("walletEntries", {
        tutorId: lesson.tutorId,
        lessonId: lesson._id,
        amountCents: tutorShare,
        type: "earning",
        status: "available",
        createdAt: Date.now(),
      });
    }
  }
  await ctx.db.patch(lesson._id, patch);
}

async function notifyBoth(ctx, lesson, template, extraParams = {}) {
  const student = await ctx.db.get(lesson.studentId);
  const tutor = await ctx.db.get(lesson.tutorId);
  if (student?.email) {
    await ctx.scheduler.runAfter(0, internal.emails.sendTemplate, {
      to: [student.email],
      template,
      params: {
        recipientName: student.name ?? "there",
        otherName: tutor?.name ?? "your tutor",
        whenUTC: lesson.startUTC,
        meetLink: lesson.meetLink,
        ...extraParams,
      },
    });
  }
  if (tutor?.email) {
    await ctx.scheduler.runAfter(0, internal.emails.sendTemplate, {
      to: [tutor.email],
      template,
      params: {
        recipientName: tutor.name ?? "there",
        otherName: student?.name ?? "your student",
        whenUTC: lesson.startUTC,
        meetLink: lesson.meetLink,
        forTutor: true,
        ...extraParams,
      },
    });
  }
}

/* ---------------------------------- queries ---------------------------------- */

export const myUpcoming = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const index = user.role === "tutor" ? "by_tutor_start" : "by_student_start";
    const field = user.role === "tutor" ? "tutorId" : "studentId";
    const lessons = await ctx.db
      .query("lessons")
      .withIndex(index, (q) =>
        q.eq(field, user._id).gt("startUTC", Date.now() - LESSON_MS)
      )
      .collect();
    const upcoming = lessons.filter((l) => l.status === "scheduled");
    upcoming.sort((a, b) => a.startUTC - b.startUTC);
    return Promise.all(upcoming.map((l) => withNames(ctx, l)));
  },
});

export const myHistory = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const index = user.role === "tutor" ? "by_tutor_start" : "by_student_start";
    const field = user.role === "tutor" ? "tutorId" : "studentId";
    const lessons = await ctx.db
      .query("lessons")
      .withIndex(index, (q) => q.eq(field, user._id))
      .order("desc")
      .take(200);
    const past = lessons.filter(
      (l) => l.status !== "scheduled" || l.endUTC < Date.now()
    );
    const settings = await getSettings(ctx);
    const result = [];
    for (const lesson of past) {
      const review = await ctx.db
        .query("reviews")
        .withIndex("by_lesson", (q) => q.eq("lessonId", lesson._id))
        .first();
      result.push({
        ...(await withNames(ctx, lesson)),
        hasReview: !!review,
        canConfirm:
          user._id === lesson.studentId &&
          awaitingPayout(lesson) &&
          lesson.status === "completed",
        canReview:
          user._id === lesson.studentId &&
          ["completed", "confirmed"].includes(lesson.status) &&
          !review,
        confirmationWindowHours: settings.confirmationWindowHours,
      });
    }
    return result;
  },
});

export const getWithUsers = internalQuery({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const lesson = await ctx.db.get(lessonId);
    if (!lesson) return null;
    const student = await ctx.db.get(lesson.studentId);
    const tutor = await ctx.db.get(lesson.tutorId);
    return { lesson, student, tutor };
  },
});

export const setMeetInfo = internalMutation({
  args: {
    lessonId: v.id("lessons"),
    meetLink: v.optional(v.string()),
    gcalEventId: v.optional(v.string()),
  },
  handler: async (ctx, { lessonId, meetLink, gcalEventId }) => {
    await ctx.db.patch(lessonId, { meetLink, gcalEventId });
  },
});

/* --------------------------------- mutations --------------------------------- */

/** Student confirms a completed lesson → tutor gets paid. */
export const confirm = mutation({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const user = await requireUser(ctx);
    const lesson = await ctx.db.get(lessonId);
    if (!lesson || lesson.studentId !== user._id) throw new Error("Not found");
    if (lesson.status !== "completed" || lesson.payoutReleased) {
      throw new Error("This lesson cannot be confirmed");
    }
    await releaseEarnings(ctx, lesson, "student");
    return { ok: true };
  },
});

/**
 * Cancel a lesson. Policy (§4.6):
 * - student ≥ window before start → hour refunded
 * - student < window → hour forfeited, tutor still paid after end time
 * - tutor any time → hour refunded, no payment, cancellations tracked
 */
export const cancel = mutation({
  args: { lessonId: v.id("lessons"), reason: v.optional(v.string()) },
  handler: async (ctx, { lessonId, reason }) => {
    const user = await requireUser(ctx);
    const lesson = await ctx.db.get(lessonId);
    if (!lesson) throw new Error("Lesson not found");
    if (lesson.status !== "scheduled") throw new Error("Lesson is not scheduled");

    const isStudent = lesson.studentId === user._id;
    const isTutor = lesson.tutorId === user._id;
    const isAdmin = user.role === "admin";
    if (!isStudent && !isTutor && !isAdmin) throw new Error("Not authorized");

    const settings = await getSettings(ctx);
    const now = Date.now();
    if (now >= lesson.startUTC && (isStudent || isTutor)) {
      throw new Error("The lesson has already started — report a no-show instead");
    }

    let refunded = false;
    if (isStudent) {
      const withinWindow =
        now > lesson.startUTC - settings.cancellationWindowHours * HOUR_MS;
      const lateCancel = withinWindow;
      if (!lateCancel && lesson.type === "regular") {
        await creditMinutes(ctx, {
          studentId: lesson.studentId,
          tutorId: lesson.tutorId,
          minutes: LESSON_MINUTES,
          rateCents: lesson.priceCents,
          reason: "refund",
          lessonId,
        });
        refunded = true;
      }
      await ctx.db.patch(lessonId, {
        status: "cancelled_student",
        lateCancel,
        cancelledAt: now,
        cancelReason: reason,
      });
    } else {
      // Tutor or admin cancellation → always refund the student's hour.
      if (lesson.type === "regular") {
        await creditMinutes(ctx, {
          studentId: lesson.studentId,
          tutorId: lesson.tutorId,
          minutes: LESSON_MINUTES,
          rateCents: lesson.priceCents,
          reason: "refund",
          lessonId,
        });
        refunded = true;
      }
      await ctx.db.patch(lessonId, {
        status: "cancelled_tutor",
        cancelledAt: now,
        cancelReason: reason,
      });
      if (isTutor) {
        const profile = await ctx.db
          .query("tutorProfiles")
          .withIndex("by_userId", (q) => q.eq("userId", lesson.tutorId))
          .first();
        if (profile) {
          const count = (profile.cancellationCount ?? 0) + 1;
          await ctx.db.patch(profile._id, {
            cancellationCount: count,
            flaggedForCancellations: count >= 3,
          });
        }
      }
    }

    if (lesson.gcalEventId) {
      await ctx.scheduler.runAfter(0, internal.meet.deleteForLesson, {
        gcalEventId: lesson.gcalEventId,
      });
    }
    await notifyBoth(ctx, lesson, "lessonCancelled", {
      byRole: isStudent ? "student" : "tutor",
      refunded,
    });
    return { refunded };
  },
});

/** Free reschedule ≥ cancellation-window hours before start. */
export const reschedule = mutation({
  args: { lessonId: v.id("lessons"), newStartUTC: v.number() },
  handler: async (ctx, { lessonId, newStartUTC }) => {
    const user = await requireUser(ctx);
    const lesson = await ctx.db.get(lessonId);
    if (!lesson) throw new Error("Lesson not found");
    if (lesson.status !== "scheduled") throw new Error("Lesson is not scheduled");
    const isStudent = lesson.studentId === user._id;
    const isTutor = lesson.tutorId === user._id;
    if (!isStudent && !isTutor) throw new Error("Not authorized");

    const settings = await getSettings(ctx);
    const now = Date.now();
    if (now > lesson.startUTC - settings.cancellationWindowHours * HOUR_MS) {
      throw new Error(
        `Rescheduling is free only ${settings.cancellationWindowHours}h or more before the lesson`
      );
    }
    // The new slot must be free for both parties.
    const days = Math.min(
      Math.ceil((newStartUTC + LESSON_MS - now) / (24 * HOUR_MS)) + 1, 200
    );
    const available = await computeSlots(ctx, lesson.tutorId, now, days);
    if (!available.includes(newStartUTC)) {
      throw new Error("The new time slot is not available");
    }
    const studentConflicts = await findConflicts(
      ctx, "studentId", lesson.studentId, newStartUTC, newStartUTC + LESSON_MS
    );
    if (studentConflicts.length > 0) {
      throw new Error("The student already has a lesson at that time");
    }

    const oldStart = lesson.startUTC;
    await ctx.db.patch(lessonId, {
      startUTC: newStartUTC,
      endUTC: newStartUTC + LESSON_MS,
      reminded24h: false,
      reminded1h: false,
    });
    if (lesson.gcalEventId) {
      await ctx.scheduler.runAfter(0, internal.meet.updateForLesson, { lessonId });
    }
    await notifyBoth(ctx, { ...lesson, startUTC: newStartUTC }, "lessonRescheduled", {
      oldWhenUTC: oldStart,
      newWhenUTC: newStartUTC,
    });
    return { ok: true };
  },
});

/** Tutor marks the student as a no-show (hour forfeited, tutor still paid). */
export const markStudentNoShow = mutation({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const user = await requireUser(ctx);
    const lesson = await ctx.db.get(lessonId);
    if (!lesson || lesson.tutorId !== user._id) throw new Error("Not found");
    if (!["scheduled", "completed"].includes(lesson.status)) {
      throw new Error("Cannot mark this lesson");
    }
    if (Date.now() < lesson.startUTC) throw new Error("Lesson has not started yet");
    await ctx.db.patch(lessonId, { status: "noshow_student" });
    return { ok: true };
  },
});

/** Student reports the tutor as a no-show (hour refunded, no payment). */
export const reportTutorNoShow = mutation({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const user = await requireUser(ctx);
    const lesson = await ctx.db.get(lessonId);
    if (!lesson || lesson.studentId !== user._id) throw new Error("Not found");
    if (!["scheduled", "completed"].includes(lesson.status)) {
      throw new Error("Cannot report this lesson");
    }
    if (Date.now() < lesson.startUTC) throw new Error("Lesson has not started yet");
    if (lesson.payoutReleased) throw new Error("Lesson already confirmed");
    await ctx.db.patch(lessonId, { status: "noshow_tutor" });
    if (lesson.type === "regular") {
      await creditMinutes(ctx, {
        studentId: lesson.studentId,
        tutorId: lesson.tutorId,
        minutes: LESSON_MINUTES,
        rateCents: lesson.priceCents,
        reason: "refund",
        lessonId,
      });
    }
    const profile = await ctx.db
      .query("tutorProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", lesson.tutorId))
      .first();
    if (profile) {
      const count = (profile.cancellationCount ?? 0) + 1;
      await ctx.db.patch(profile._id, {
        cancellationCount: count,
        flaggedForCancellations: count >= 3,
      });
    }
    return { ok: true };
  },
});

/* ----------------------------------- crons ----------------------------------- */

/** scheduled → completed once the end time passes; prompt the student. */
export const markCompletedTick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query("lessons")
      .withIndex("by_status_end", (q) =>
        q.eq("status", "scheduled").lt("endUTC", now)
      )
      .take(100);
    for (const lesson of due) {
      await ctx.db.patch(lesson._id, { status: "completed" });
      if (!lesson.confirmEmailSent) {
        const student = await ctx.db.get(lesson.studentId);
        const tutor = await ctx.db.get(lesson.tutorId);
        if (student?.email) {
          await ctx.scheduler.runAfter(0, internal.emails.sendTemplate, {
            to: [student.email],
            template: "confirmLessonPrompt",
            params: {
              recipientName: student.name ?? "there",
              otherName: tutor?.name ?? "your tutor",
              whenUTC: lesson.startUTC,
            },
          });
        }
        await ctx.db.patch(lesson._id, { confirmEmailSent: true });
      }
    }
  },
});

/** Auto-confirm (and release escrow) after the confirmation window. */
export const autoConfirmTick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const settings = await getSettings(ctx);
    const threshold = Date.now() - settings.confirmationWindowHours * HOUR_MS;
    for (const status of ["completed", "noshow_student", "cancelled_student"]) {
      const due = await ctx.db
        .query("lessons")
        .withIndex("by_status_end", (q) =>
          q.eq("status", status).lt("endUTC", threshold)
        )
        .take(100);
      for (const lesson of due) {
        if (lesson.payoutReleased) continue;
        if (status === "cancelled_student" && lesson.lateCancel !== true) continue;
        if (lesson.type === "trial") {
          // Trials just finalize platform revenue.
          await releaseEarnings(ctx, lesson, "auto");
          continue;
        }
        await releaseEarnings(ctx, lesson, "auto");
      }
    }
  },
});

/** 24h and 1h lesson reminders. */
export const reminderTick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const soon = await ctx.db
      .query("lessons")
      .withIndex("by_status_start", (q) =>
        q.eq("status", "scheduled").gt("startUTC", now).lt("startUTC", now + 24 * HOUR_MS)
      )
      .take(200);
    for (const lesson of soon) {
      const in1h = lesson.startUTC - now <= HOUR_MS;
      if (in1h && !lesson.reminded1h) {
        await ctx.db.patch(lesson._id, { reminded1h: true, reminded24h: true });
        await notifyBoth(ctx, lesson, "lessonReminder", { hoursBefore: 1 });
      } else if (!lesson.reminded24h) {
        await ctx.db.patch(lesson._id, { reminded24h: true });
        await notifyBoth(ctx, lesson, "lessonReminder", { hoursBefore: 24 });
      }
    }
  },
});
