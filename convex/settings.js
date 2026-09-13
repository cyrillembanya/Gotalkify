import { query, mutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { getSettings, requireAdmin } from "./lib";

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

export const update = mutation({
  args: {
    commissionPercent: v.number(),
    cancellationWindowHours: v.number(),
    confirmationWindowHours: v.number(),
    minNoticeHours: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.commissionPercent < 0 || args.commissionPercent > 100) {
      throw new ConvexError("Commission must be 0–100%");
    }
    for (const key of ["cancellationWindowHours", "confirmationWindowHours", "minNoticeHours"]) {
      if (args[key] < 0 || args[key] > 24 * 14) throw new ConvexError(`Invalid ${key}`);
    }
    const existing = await ctx.db.query("settings").first();
    if (existing) await ctx.db.patch(existing._id, args);
    else await ctx.db.insert("settings", args);
    return { ok: true };
  },
});
