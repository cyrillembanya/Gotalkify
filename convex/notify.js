/**
 * Lesson notification helpers shared by booking, rescheduling and cancelling.
 * These are plain functions (not Convex functions) called from mutations —
 * the actual sending is scheduled on `emails.sendTemplate`.
 */

import { internal } from "./_generated/api";

const SITE = () => process.env.SITE_URL ?? "https://gotalkify.com";

/** Absolute URL of the built-in classroom for a lesson. */
export function classUrl(roomId) {
  return roomId ? `${SITE()}/class/${roomId}` : `${SITE()}/dashboard/lessons`;
}

/**
 * Send one template to both the student and the tutor of a lesson.
 * Each side gets `timezone` set to their own, so the same lesson reads as
 * 15:00 in New York and 21:00 in Paris in the two emails.
 */
export async function notifyBoth(ctx, lesson, template, extraParams = {}) {
  const student = await ctx.db.get(lesson.studentId);
  const tutor = await ctx.db.get(lesson.tutorId);
  const joinUrl = classUrl(lesson.roomId);

  if (student?.email) {
    await ctx.scheduler.runAfter(0, internal.emails.sendTemplate, {
      to: [student.email],
      template,
      params: {
        recipientName: student.name ?? "there",
        otherName: tutor?.name ?? "your tutor",
        whenUTC: lesson.startUTC,
        timezone: student.timezone ?? "UTC",
        joinUrl,
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
        timezone: tutor.timezone ?? "UTC",
        joinUrl,
        forTutor: true,
        ...extraParams,
      },
    });
  }
}

/** Booking confirmation, including the unguessable class link. */
export async function sendLessonBooked(ctx, lesson) {
  await notifyBoth(ctx, lesson, "lessonBooked", {
    isTrial: lesson.type === "trial",
  });
}
