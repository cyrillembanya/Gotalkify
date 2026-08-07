import { query, mutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import {
  requireRole,
  getSettings,
  LESSON_MINUTES,
  LESSON_MS,
  HOUR_MS,
  DAY_MS,
  overlaps,
  utcDateString,
} from "./lib";

/** Tutor's own weekly rules + upcoming overrides. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, "tutor");
    const rules = await ctx.db
      .query("availabilityRules")
      .withIndex("by_tutor", (q) => q.eq("tutorId", user._id))
      .collect();
    const today = utcDateString(Date.now());
    const overrides = (
      await ctx.db
        .query("availabilityOverrides")
        .withIndex("by_tutor_date", (q) => q.eq("tutorId", user._id))
        .collect()
    ).filter((o) => o.date >= today);
    return { rules, overrides };
  },
});

/**
 * Replace all weekly rules. The client converts the tutor's local windows to
 * UTC (weekday 0–6 + minutes) and splits windows that cross UTC midnight.
 */
export const saveRules = mutation({
  args: {
    rules: v.array(
      v.object({
        weekday: v.number(),
        startMinuteUTC: v.number(),
        endMinuteUTC: v.number(),
      })
    ),
  },
  handler: async (ctx, { rules }) => {
    const user = await requireRole(ctx, "tutor");
    for (const rule of rules) {
      if (
        rule.weekday < 0 || rule.weekday > 6 ||
        rule.startMinuteUTC < 0 || rule.endMinuteUTC > 1440 ||
        rule.startMinuteUTC >= rule.endMinuteUTC
      ) {
        throw new ConvexError("Invalid availability window");
      }
    }
    // Merge duplicate, overlapping and touching windows within each weekday
    // so a tutor can't end up with e.g. two identical 09:00–17:00 blocks.
    const sorted = [...rules].sort(
      (a, b) => a.weekday - b.weekday || a.startMinuteUTC - b.startMinuteUTC
    );
    const normalized = [];
    for (const rule of sorted) {
      const prev = normalized[normalized.length - 1];
      if (
        prev &&
        prev.weekday === rule.weekday &&
        rule.startMinuteUTC <= prev.endMinuteUTC
      ) {
        prev.endMinuteUTC = Math.max(prev.endMinuteUTC, rule.endMinuteUTC);
      } else {
        normalized.push({ ...rule });
      }
    }
    const existing = await ctx.db
      .query("availabilityRules")
      .withIndex("by_tutor", (q) => q.eq("tutorId", user._id))
      .collect();
    for (const rule of existing) await ctx.db.delete(rule._id);
    for (const rule of normalized) {
      await ctx.db.insert("availabilityRules", { tutorId: user._id, ...rule });
    }
    return { ok: true, rules: normalized };
  },
});

export const addOverride = mutation({
  args: {
    date: v.string(),
    type: v.union(v.literal("extra"), v.literal("blocked")),
    startMinuteUTC: v.number(),
    endMinuteUTC: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "tutor");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
      throw new ConvexError("Invalid date");
    }
    if (
      args.startMinuteUTC < 0 || args.endMinuteUTC > 1440 ||
      args.startMinuteUTC >= args.endMinuteUTC
    ) {
      throw new ConvexError("Invalid time window");
    }
    // Idempotent: adding the exact same override twice keeps a single row.
    const duplicate = (
      await ctx.db
        .query("availabilityOverrides")
        .withIndex("by_tutor_date", (q) =>
          q.eq("tutorId", user._id).eq("date", args.date)
        )
        .collect()
    ).find(
      (o) =>
        o.type === args.type &&
        o.startMinuteUTC === args.startMinuteUTC &&
        o.endMinuteUTC === args.endMinuteUTC
    );
    if (duplicate) return duplicate._id;
    return await ctx.db.insert("availabilityOverrides", {
      tutorId: user._id,
      ...args,
    });
  },
});

export const removeOverride = mutation({
  args: { overrideId: v.id("availabilityOverrides") },
  handler: async (ctx, { overrideId }) => {
    const user = await requireRole(ctx, "tutor");
    const override = await ctx.db.get(overrideId);
    if (!override || override.tutorId !== user._id) throw new Error("Not found");
    await ctx.db.delete(overrideId);
  },
});

/**
 * Compute bookable slots for a tutor:
 * weekly rules + "extra" overrides − "blocked" overrides − existing lessons
 * − minimum-notice buffer. Returns sorted start times (ms UTC).
 */
export async function computeSlots(ctx, tutorId, fromUTC, days) {
  const settings = await getSettings(ctx);
  const now = Date.now();
  const notBefore = now + settings.minNoticeHours * HOUR_MS;
  const rangeStart = Math.max(fromUTC, now);
  const rangeEnd = rangeStart + days * DAY_MS;

  const rules = await ctx.db
    .query("availabilityRules")
    .withIndex("by_tutor", (q) => q.eq("tutorId", tutorId))
    .collect();
  const allOverrides = await ctx.db
    .query("availabilityOverrides")
    .withIndex("by_tutor_date", (q) => q.eq("tutorId", tutorId))
    .collect();
  const lessons = (
    await ctx.db
      .query("lessons")
      .withIndex("by_tutor_start", (q) =>
        q.eq("tutorId", tutorId).gt("startUTC", rangeStart - LESSON_MS).lt("startUTC", rangeEnd)
      )
      .collect()
  ).filter((l) => l.status === "scheduled");

  const slots = [];
  const dayStart0 = Math.floor(rangeStart / DAY_MS) * DAY_MS;
  for (let dayStart = dayStart0; dayStart < rangeEnd; dayStart += DAY_MS) {
    const date = utcDateString(dayStart);
    const weekday = new Date(dayStart).getUTCDay();
    const dayOverrides = allOverrides.filter((o) => o.date === date);
    const blocked = dayOverrides.filter((o) => o.type === "blocked");

    const windows = [
      ...rules
        .filter((r) => r.weekday === weekday)
        .map((r) => [r.startMinuteUTC, r.endMinuteUTC]),
      ...dayOverrides
        .filter((o) => o.type === "extra")
        .map((o) => [o.startMinuteUTC, o.endMinuteUTC]),
    ];

    for (const [startMin, endMin] of windows) {
      for (let m = startMin; m + LESSON_MINUTES <= endMin; m += LESSON_MINUTES) {
        const slotStart = dayStart + m * 60 * 1000;
        const slotEnd = slotStart + LESSON_MS;
        if (slotStart < notBefore) continue;
        if (slotStart >= rangeEnd) continue;
        if (
          blocked.some((b) =>
            overlaps(
              dayStart + b.startMinuteUTC * 60000,
              dayStart + b.endMinuteUTC * 60000,
              slotStart,
              slotEnd
            )
          )
        ) {
          continue;
        }
        if (lessons.some((l) => overlaps(l.startUTC, l.endUTC, slotStart, slotEnd))) {
          continue;
        }
        slots.push(slotStart);
      }
    }
  }
  return [...new Set(slots)].sort((a, b) => a - b);
}

/** Public: bookable slots for a tutor over the next `days` days. */
export const slots = query({
  args: {
    tutorId: v.id("users"),
    fromUTC: v.optional(v.number()),
    days: v.optional(v.number()),
  },
  handler: async (ctx, { tutorId, fromUTC, days }) => {
    const window = Math.min(days ?? 14, 28);
    return await computeSlots(ctx, tutorId, fromUTC ?? Date.now(), window);
  },
});
