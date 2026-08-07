import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./lib";

export const create = mutation({
  args: {
    lessonId: v.id("lessons"),
    rating: v.number(),
    text: v.string(),
  },
  handler: async (ctx, { lessonId, rating, text }) => {
    const user = await requireUser(ctx);
    if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      throw new Error("Rating must be 1–5");
    }
    const lesson = await ctx.db.get(lessonId);
    if (!lesson || lesson.studentId !== user._id) throw new Error("Not found");
    if (!["completed", "confirmed"].includes(lesson.status)) {
      throw new Error("You can review a lesson after it has taken place");
    }
    const existing = await ctx.db
      .query("reviews")
      .withIndex("by_lesson", (q) => q.eq("lessonId", lessonId))
      .first();
    if (existing) throw new Error("You already reviewed this lesson");

    await ctx.db.insert("reviews", {
      studentId: user._id,
      tutorId: lesson.tutorId,
      lessonId,
      rating,
      text: text.trim().slice(0, 2000),
      createdAt: Date.now(),
    });

    // Update the tutor's aggregate rating.
    const profile = await ctx.db
      .query("tutorProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", lesson.tutorId))
      .first();
    if (profile) {
      const all = await ctx.db
        .query("reviews")
        .withIndex("by_tutor", (q) => q.eq("tutorId", lesson.tutorId))
        .collect();
      const avg = all.reduce((sum, r) => sum + r.rating, 0) / all.length;
      await ctx.db.patch(profile._id, {
        rating: Math.round(avg * 10) / 10,
        reviewCount: all.length,
      });
    }
    return { ok: true };
  },
});

export const forTutor = query({
  args: { tutorId: v.id("users") },
  handler: async (ctx, { tutorId }) => {
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_tutor", (q) => q.eq("tutorId", tutorId))
      .order("desc")
      .take(50);
    const result = [];
    for (const review of reviews) {
      const student = await ctx.db.get(review.studentId);
      result.push({ ...review, studentName: student?.name ?? "Student" });
    }
    return result;
  },
});
