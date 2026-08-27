/**
 * Development and QA helpers. Everything here is an `internalMutation`, so it
 * is unreachable from the browser and can only be invoked with the CLI:
 *
 *   npx convex run devtools:startLessonNow
 *
 * Safe to delete once the classroom has been signed off.
 */

import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { LESSON_MS } from "./lib";
import { ensureRoomId } from "./video";

/**
 * Move a lesson so its classroom is open right now, which is otherwise a
 * 15-minute wait every time you want to test a call.
 *
 * With no arguments it picks the soonest scheduled lesson. `minutesFromNow`
 * shifts the start time (negative means the lesson is already under way).
 */
export const startLessonNow = internalMutation({
  args: {
    lessonId: v.optional(v.id("lessons")),
    minutesFromNow: v.optional(v.number()),
  },
  handler: async (ctx, { lessonId, minutesFromNow = -1 }) => {
    let lesson = lessonId ? await ctx.db.get(lessonId) : null;
    if (!lesson) {
      const [soonest] = await ctx.db
        .query("lessons")
        .withIndex("by_status_start", (q) => q.eq("status", "scheduled"))
        .take(1);
      lesson = soonest;
    }
    if (!lesson) throw new Error("No scheduled lesson to move");

    const startUTC = Date.now() + minutesFromNow * 60_000;
    await ctx.db.patch(lesson._id, {
      startUTC,
      endUTC: startUTC + LESSON_MS,
      status: "scheduled",
      reminded1h: false,
      reminded24h: false,
      confirmEmailSent: false,
    });

    const roomId = await ensureRoomId(ctx, lesson);
    return {
      lessonId: lesson._id,
      roomId,
      startsAtUTC: new Date(startUTC).toISOString(),
      path: `/class/${roomId}`,
    };
  },
});
