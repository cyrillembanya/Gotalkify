import { query, mutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { getSettings, requireAdmin } from "./lib";
import { FALLBACK_SAFETY_CONTACT } from "./moderation";

/** Public: policy values used in UI copy (cancellation window etc.). */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const settings = await getSettings(ctx);
    return {
      commissionPercent: settings.commissionPercent,
      cancellationWindowHours: settings.cancellationWindowHours,
      confirmationWindowHours: settings.confirmationWindowHours,
      minNoticeHours: settings.minNoticeHours,
    };
  },
});

/** Admin: the values above plus the chat-safety settings. */
export const adminGet = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const settings = await getSettings(ctx);
    return {
      commissionPercent: settings.commissionPercent,
      cancellationWindowHours: settings.cancellationWindowHours,
      confirmationWindowHours: settings.confirmationWindowHours,
      minNoticeHours: settings.minNoticeHours,
      // Shown with the fallback filled in, so the screen always names the
      // address that alerts actually go to today.
      safetyContactEmail:
        settings.safetyContactEmail ??
        process.env.SAFETY_CONTACT_EMAIL ??
        FALLBACK_SAFETY_CONTACT,
      moderationEnabled: settings.moderationEnabled !== false,
    };
  },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const update = mutation({
  args: {
    commissionPercent: v.number(),
    cancellationWindowHours: v.number(),
    confirmationWindowHours: v.number(),
    minNoticeHours: v.number(),
    safetyContactEmail: v.optional(v.string()),
    moderationEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.commissionPercent < 0 || args.commissionPercent > 100) {
      throw new ConvexError("Commission must be 0–100%");
    }
    for (const key of ["cancellationWindowHours", "confirmationWindowHours", "minNoticeHours"]) {
      if (args[key] < 0 || args[key] > 24 * 14) throw new ConvexError(`Invalid ${key}`);
    }
    const safetyContactEmail = args.safetyContactEmail?.trim();
    if (safetyContactEmail && !EMAIL_RE.test(safetyContactEmail)) {
      throw new ConvexError("Enter a valid safety contact email address");
    }
    const fields = { ...args, safetyContactEmail: safetyContactEmail || undefined };
    const existing = await ctx.db.query("settings").first();
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert("settings", fields);
    return { ok: true };
  },
});
