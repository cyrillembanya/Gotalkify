import {
  query,
  mutation,
  internalMutation,
} from "./_generated/server";
import { ConvexError, v } from "convex/values";
import {
  requireRole,
  getSettings,
  LESSON_MINUTES,
  LESSON_MS,
  HOUR_MS,
  DAY_MS,
  overlaps,
} from "./lib";
import {
  addDays,
  safeZone,
  utcWeeklyToLocal,
  weekdayOfDate,
  zonedDayMapper,
  zonedDateString,
  zonedParts,
} from "./tz";

/** The zone a tutor's availability is written in (their profile timezone). */
async function tutorZone(ctx, tutorId) {
  const tutor = await ctx.db.get(tutorId);
  return safeZone(tutor?.timezone);
}

/**
 * Normalize a stored rule to the tutor's local wall time.
 * New rows carry local minutes + the zone they were written in; legacy rows
 * hold UTC minutes and are converted with the zone's current offset — the same
 * approximation that produced them.
 */
function ruleToLocal(rule, zone) {
  if (rule.startMinute !== undefined && rule.endMinute !== undefined) {
    return [
      {
        weekday: rule.weekday,
        startMinute: rule.startMinute,
        endMinute: rule.endMinute,
      },
    ];
  }
  return utcWeeklyToLocal(
    [
      {
        weekday: rule.weekday,
        startMinuteUTC: rule.startMinuteUTC ?? 0,
        endMinuteUTC: rule.endMinuteUTC ?? 0,
      },
    ],
    zone
  );
}

/**
 * Normalize a stored override to a local date + local minutes.
 * Legacy rows are UTC-dated; their instants are recomputed in UTC and then
 * expressed on the tutor's local calendar.
 */
function overrideToLocal(override, zone) {
  if (override.startMinute !== undefined && override.endMinute !== undefined) {
    return {
      ...override,
      date: override.date,
      startMinute: override.startMinute,
      endMinute: override.endMinute,
    };
  }
  const startUTC =
    Date.parse(`${override.date}T00:00:00Z`) +
    (override.startMinuteUTC ?? 0) * 60000;
  const endUTC =
    Date.parse(`${override.date}T00:00:00Z`) + (override.endMinuteUTC ?? 0) * 60000;
  const startParts = zonedParts(startUTC, zone);
  const spanMinutes = Math.round((endUTC - startUTC) / 60000);
  return {
    ...override,
    date: startParts.dateString,
    startMinute: startParts.minutesOfDay,
    endMinute: Math.min(startParts.minutesOfDay + spanMinutes, 1440),
  };
}

/** Sort and merge touching/overlapping windows within each weekday. */
function mergeWindows(windows) {
  const sorted = [...windows].sort(
    (a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute
  );
  const merged = [];
  for (const w of sorted) {
    const prev = merged[merged.length - 1];
    if (prev && prev.weekday === w.weekday && w.startMinute <= prev.endMinute) {
      prev.endMinute = Math.max(prev.endMinute, w.endMinute);
    } else {
      merged.push({ ...w });
    }
  }
  return merged;
}

function assertWindow(startMinute, endMinute) {
  if (
    !Number.isInteger(startMinute) ||
    !Number.isInteger(endMinute) ||
    startMinute < 0 ||
    endMinute > 1440 ||
    startMinute >= endMinute
  ) {
    throw new ConvexError("Invalid time window");
  }
}

/** Tutor's own weekly rules + upcoming overrides, in the tutor's timezone. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireRole(ctx, "tutor");
    const zone = safeZone(user.timezone);
    const storedRules = await ctx.db
      .query("availabilityRules")
      .withIndex("by_tutor", (q) => q.eq("tutorId", user._id))
      .collect();
    const rules = mergeWindows(storedRules.flatMap((rule) => ruleToLocal(rule, zone)));

    const today = zonedDateString(Date.now(), zone);
    const overrides = (
      await ctx.db
        .query("availabilityOverrides")
        .withIndex("by_tutor_date", (q) => q.eq("tutorId", user._id))
        .collect()
    )
      .map((override) => overrideToLocal(override, zone))
      .filter((override) => override.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date) || a.startMinute - b.startMinute);

    return { timezone: zone, rules, overrides };
  },
});

/**
 * Replace all weekly rules. Windows arrive as the tutor's local wall time
 * (weekday 0–6 + minutes from local midnight) and are stored that way,
 * together with the zone they were written in.
 */
export const saveRules = mutation({
  args: {
    rules: v.array(
      v.object({
        weekday: v.number(),
        startMinute: v.number(),
        endMinute: v.number(),
      })
    ),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, { rules, timezone }) => {
    const user = await requireRole(ctx, "tutor");
    // The editor sends the zone it rendered in; refuse a mismatch rather than
    // silently reinterpreting 09:00 in a different zone.
    const zone = safeZone(user.timezone);
    if (timezone && safeZone(timezone) !== zone) {
      throw new ConvexError(
        "Your timezone changed while editing. Reload the page and try again."
      );
    }
    for (const rule of rules) {
      if (rule.weekday < 0 || rule.weekday > 6) {
        throw new ConvexError("Invalid availability window");
      }
      assertWindow(rule.startMinute, rule.endMinute);
    }
    // Merge duplicate, overlapping and touching windows within each weekday so
    // a tutor can't end up with e.g. two identical 09:00–17:00 blocks.
    const normalized = mergeWindows(rules);
    const existing = await ctx.db
      .query("availabilityRules")
      .withIndex("by_tutor", (q) => q.eq("tutorId", user._id))
      .collect();
    for (const rule of existing) await ctx.db.delete(rule._id);
    for (const rule of normalized) {
      await ctx.db.insert("availabilityRules", {
        tutorId: user._id,
        weekday: rule.weekday,
        startMinute: rule.startMinute,
        endMinute: rule.endMinute,
        timezone: zone,
      });
    }
    return { ok: true, timezone: zone, rules: normalized };
  },
});

export const addOverride = mutation({
  args: {
    date: v.string(), // "YYYY-MM-DD" on the tutor's local calendar
    type: v.union(v.literal("extra"), v.literal("blocked")),
    startMinute: v.number(),
    endMinute: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "tutor");
    const zone = safeZone(user.timezone);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
      throw new ConvexError("Invalid date");
    }
    assertWindow(args.startMinute, args.endMinute);
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
        o.startMinute === args.startMinute &&
        o.endMinute === args.endMinute &&
        safeZone(o.timezone) === zone
    );
    if (duplicate) return duplicate._id;
    return await ctx.db.insert("availabilityOverrides", {
      tutorId: user._id,
      date: args.date,
      type: args.type,
      startMinute: args.startMinute,
      endMinute: args.endMinute,
      timezone: zone,
    });
  },
});

export const removeOverride = mutation({
  args: { overrideId: v.id("availabilityOverrides") },
  handler: async (ctx, { overrideId }) => {
    const user = await requireRole(ctx, "tutor");
    const override = await ctx.db.get(overrideId);
    if (!override || override.tutorId !== user._id) throw new Error("Not found");
    await ctx.db.delete(override._id);
  },
});

/**
 * Compute bookable slots for a tutor:
 * weekly rules + "extra" overrides − "blocked" overrides − existing lessons
 * − minimum-notice buffer. Returns sorted start times (ms UTC).
 *
 * Days are walked on the *tutor's* calendar, and each window is resolved to an
 * instant through their zone, so a 09:00 window is 09:00 for them in every
 * season. Students convert those instants into their own zone for display.
 */
export async function computeSlots(ctx, tutorId, fromUTC, days) {
  const settings = await getSettings(ctx);
  const zone = await tutorZone(ctx, tutorId);
  const now = Date.now();
  const notBefore = now + settings.minNoticeHours * HOUR_MS;
  const rangeStart = Math.max(fromUTC, now);
  const rangeEnd = rangeStart + days * DAY_MS;

  const storedRules = await ctx.db
    .query("availabilityRules")
    .withIndex("by_tutor", (q) => q.eq("tutorId", tutorId))
    .collect();
  const rules = mergeWindows(storedRules.flatMap((rule) => ruleToLocal(rule, zone)));

  const storedOverrides = await ctx.db
    .query("availabilityOverrides")
    .withIndex("by_tutor_date", (q) => q.eq("tutorId", tutorId))
    .collect();
  const overrides = storedOverrides.map((override) => overrideToLocal(override, zone));

  const lessons = (
    await ctx.db
      .query("lessons")
      .withIndex("by_tutor_start", (q) =>
        q.eq("tutorId", tutorId).gt("startUTC", rangeStart - LESSON_MS).lt("startUTC", rangeEnd)
      )
      .collect()
  ).filter((l) => l.status === "scheduled");

  const slots = [];
  // Start a local day early: a window on the tutor's "yesterday" can still
  // reach into the requested range for students far to the west.
  let date = addDays(zonedDateString(rangeStart, zone), -1);
  const lastDate = addDays(zonedDateString(rangeEnd, zone), 1);

  while (date <= lastDate) {
    const weekday = weekdayOfDate(date);
    const toInstant = zonedDayMapper(date, zone);
    const dayOverrides = overrides.filter((o) => o.date === date);
    const blocked = dayOverrides
      .filter((o) => o.type === "blocked")
      .map((o) => ({
        startUTC: toInstant(o.startMinute),
        endUTC: toInstant(o.endMinute),
      }));

    const windows = [
      ...rules
        .filter((r) => r.weekday === weekday)
        .map((r) => [r.startMinute, r.endMinute]),
      ...dayOverrides
        .filter((o) => o.type === "extra")
        .map((o) => [o.startMinute, o.endMinute]),
    ];

    for (const [startMin, endMin] of windows) {
      for (let m = startMin; m + LESSON_MINUTES <= endMin; m += LESSON_MINUTES) {
        const slotStart = toInstant(m);
        const slotEnd = slotStart + LESSON_MS;
        if (slotStart < notBefore) continue;
        if (slotStart < rangeStart || slotStart >= rangeEnd) continue;
        if (blocked.some((b) => overlaps(b.startUTC, b.endUTC, slotStart, slotEnd))) {
          continue;
        }
        if (lessons.some((l) => overlaps(l.startUTC, l.endUTC, slotStart, slotEnd))) {
          continue;
        }
        slots.push(slotStart);
      }
    }
    date = addDays(date, 1);
  }
  return [...new Set(slots)].sort((a, b) => a - b);
}

/**
 * Public: bookable slots for a tutor over the next `days` days, as UTC
 * instants. The tutor's zone comes along so the booking UI can show what the
 * time is for them too ("9:00 AM your time · 3:00 PM for your tutor").
 */
export const slots = query({
  args: {
    tutorId: v.id("users"),
    fromUTC: v.optional(v.number()),
    days: v.optional(v.number()),
  },
  handler: async (ctx, { tutorId, fromUTC, days }) => {
    const window = Math.min(days ?? 14, 28);
    return {
      timezone: await tutorZone(ctx, tutorId),
      slots: await computeSlots(ctx, tutorId, fromUTC ?? Date.now(), window),
    };
  },
});

/**
 * One-off migration: rewrite legacy UTC-stored availability into the tutor's
 * local wall time. Safe to re-run — rows already carrying local minutes are
 * skipped. Run with: npx convex run availability:migrateToLocal
 */
export const migrateToLocal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const zones = new Map();
    const zoneOf = async (tutorId) => {
      if (!zones.has(tutorId)) zones.set(tutorId, await tutorZone(ctx, tutorId));
      return zones.get(tutorId);
    };

    let rulesMigrated = 0;
    for (const rule of await ctx.db.query("availabilityRules").collect()) {
      if (rule.startMinute !== undefined) continue;
      const zone = await zoneOf(rule.tutorId);
      const [local] = ruleToLocal(rule, zone);
      if (!local) continue;
      await ctx.db.patch(rule._id, {
        weekday: local.weekday,
        startMinute: local.startMinute,
        endMinute: local.endMinute,
        timezone: zone,
        startMinuteUTC: undefined,
        endMinuteUTC: undefined,
      });
      rulesMigrated++;
    }

    let overridesMigrated = 0;
    for (const override of await ctx.db.query("availabilityOverrides").collect()) {
      if (override.startMinute !== undefined) continue;
      const zone = await zoneOf(override.tutorId);
      const local = overrideToLocal(override, zone);
      await ctx.db.patch(override._id, {
        date: local.date,
        startMinute: local.startMinute,
        endMinute: local.endMinute,
        timezone: zone,
        startMinuteUTC: undefined,
        endMinuteUTC: undefined,
      });
      overridesMigrated++;
    }

    return { rulesMigrated, overridesMigrated };
  },
});
