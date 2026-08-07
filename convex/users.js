import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { currentUser, requireUser } from "./lib";

/** Current user + tutor profile (if any), with resolved avatar URL. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user) return null;
    let tutorProfile = null;
    const profile = await ctx.db
      .query("tutorProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();
    if (profile) {
      tutorProfile = {
        ...profile,
        photoUrl: profile.photoStorageId
          ? await ctx.storage.getUrl(profile.photoStorageId)
          : null,
        introVideoUrl: profile.introVideoStorageId
          ? await ctx.storage.getUrl(profile.introVideoStorageId)
          : null,
      };
    }
    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role ?? "student",
      status: user.status ?? "active",
      timezone: user.timezone ?? "UTC",
      locale: user.locale ?? "en",
      learningLanguage: user.learningLanguage,
      level: user.level,
      goals: user.goals,
      image: user.image,
      avatarUrl: user.avatarStorageId
        ? await ctx.storage.getUrl(user.avatarStorageId)
        : (user.image ?? null),
      tutorProfile,
    };
  },
});

export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    timezone: v.optional(v.string()),
    locale: v.optional(v.string()),
    learningLanguage: v.optional(v.string()),
    level: v.optional(v.string()),
    goals: v.optional(v.string()),
    avatarStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const patch = {};
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined) patch[key] = value;
    }
    if (Object.keys(patch).length > 0) await ctx.db.patch(user._id, patch);
    return { ok: true };
  },
});

export const setTimezone = mutation({
  args: { timezone: v.string() },
  handler: async (ctx, { timezone }) => {
    const user = await requireUser(ctx);
    await ctx.db.patch(user._id, { timezone });
  },
});

export const getById = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => ctx.db.get(userId),
});
