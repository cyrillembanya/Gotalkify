import { query, mutation, internalQuery } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { currentUser, requireUser } from "./lib";
import { isValidTimeZone } from "./tz";

/**
 * How the user's timezone came to be set.
 *
 * Rows written before timezones were tracked have no `timezoneSource`. Signup
 * used to hard-code "UTC", so that value means "never actually chosen" and
 * detection should replace it; any other saved zone is treated as the user's
 * own choice and is left alone.
 */
function timezoneSourceOf(user) {
  if (user.timezoneSource) return user.timezoneSource;
  return user.timezone && user.timezone !== "UTC" ? "manual" : "auto";
}

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
      timezoneSource: timezoneSourceOf(user),
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
    if (patch.timezone !== undefined) {
      if (!isValidTimeZone(patch.timezone)) throw new ConvexError("Unknown timezone");
      // Chosen in the settings form — detection must not override it later.
      patch.timezoneSource = "manual";
    }
    if (Object.keys(patch).length > 0) await ctx.db.patch(user._id, patch);
    return { ok: true };
  },
});

/**
 * Set the timezone every displayed time follows.
 *
 * `auto: true` comes from browser detection and yields to a zone the user
 * picked themselves — someone who deliberately watches Paris time from a trip
 * to New York keeps seeing Paris time.
 */
export const setTimezone = mutation({
  args: { timezone: v.string(), auto: v.optional(v.boolean()) },
  handler: async (ctx, { timezone, auto }) => {
    const user = await requireUser(ctx);
    if (!isValidTimeZone(timezone)) throw new ConvexError("Unknown timezone");
    if (auto && timezoneSourceOf(user) === "manual") {
      return { ok: false, kept: user.timezone };
    }
    if (user.timezone === timezone && user.timezoneSource === (auto ? "auto" : "manual")) {
      return { ok: true, timezone };
    }
    await ctx.db.patch(user._id, {
      timezone,
      timezoneSource: auto ? "auto" : "manual",
    });
    return { ok: true, timezone };
  },
});

/**
 * Drop a manual pin and follow the device again ("Use Europe/Paris" in the
 * dashboard header). Distinct from `setTimezone({ auto: true })`, which is
 * background detection and must never override a deliberate choice.
 */
export const followDeviceTimezone = mutation({
  args: { timezone: v.string() },
  handler: async (ctx, { timezone }) => {
    const user = await requireUser(ctx);
    if (!isValidTimeZone(timezone)) throw new ConvexError("Unknown timezone");
    await ctx.db.patch(user._id, { timezone, timezoneSource: "auto" });
    return { ok: true, timezone };
  },
});

export const getById = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => ctx.db.get(userId),
});
