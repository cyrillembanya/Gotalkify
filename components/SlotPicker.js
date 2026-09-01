"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { fmtDayLabel, fmtTime, fmtDateTime, zoneAbbreviation } from "@/lib/format";
import { safeZone } from "@/lib/tz";
import { useViewerTimezone } from "@/lib/useViewerTimezone";

/**
 * Bookable-slot picker for a tutor.
 *
 * Slots arrive from the backend as UTC instants and are grouped and labelled in
 * the *viewer's* timezone — the same slot shows as 3:00 PM to a student in the
 * US and 9:00 PM to one in Paris. When the tutor keeps a different clock, the
 * selected time is also spelled out in theirs, so neither side has to do the
 * arithmetic.
 */
export default function SlotPicker({
  tutorUserId,
  tutorName,
  selected,
  onSelect,
  days = 14,
}) {
  const zone = safeZone(useViewerTimezone());
  const data = useQuery(
    api.availability.slots,
    tutorUserId ? { tutorId: tutorUserId, days } : "skip"
  );
  const [page, setPage] = useState(0);

  const slots = data?.slots;
  const tutorZone = safeZone(data?.timezone);
  const showTutorTime = Boolean(data) && tutorZone !== zone;

  const grouped = useMemo(() => {
    if (!slots) return [];
    const byDay = new Map();
    for (const slot of slots) {
      const dayLabel = fmtDayLabel(slot, zone);
      if (!byDay.has(dayLabel)) byDay.set(dayLabel, []);
      byDay.get(dayLabel).push(slot);
    }
    return [...byDay.entries()];
  }, [slots, zone]);

  if (data === undefined) {
    return <p className="py-6 text-center text-sm text-slate-500">Loading availability…</p>;
  }
  if (slots.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500">
        No available time slots in the next {days} days.
      </p>
    );
  }

  const perPage = 4;
  const pages = Math.ceil(grouped.length / perPage);
  const visible = grouped.slice(page * perPage, page * perPage + perPage);
  const firstSlot = slots[0];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          className="btn-ghost px-2 py-1"
          onClick={() => setPage(Math.max(0, page - 1))}
          disabled={page === 0}
          aria-label="Earlier days"
        >
          ←
        </button>
        <span className="text-center text-xs font-medium text-slate-500">
          Times shown in your timezone —{" "}
          <span className="font-semibold text-slate-700">
            {zone.replace(/_/g, " ")} ({zoneAbbreviation(zone, firstSlot)})
          </span>
        </span>
        <button
          className="btn-ghost px-2 py-1"
          onClick={() => setPage(Math.min(pages - 1, page + 1))}
          disabled={page >= pages - 1}
          aria-label="Later days"
        >
          →
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {visible.map(([day, daySlots]) => (
          <div key={day}>
            <p className="mb-2 text-center text-xs font-semibold text-slate-700">{day}</p>
            <div className="flex flex-col gap-1.5">
              {daySlots.map((slot) => (
                <button
                  key={slot}
                  onClick={() => onSelect(slot)}
                  title={
                    showTutorTime
                      ? `${fmtDateTime(slot, zone, { withZone: true })} · ${fmtDateTime(
                          slot,
                          tutorZone,
                          { withZone: true }
                        )} for ${tutorName ?? "your tutor"}`
                      : fmtDateTime(slot, zone, { withZone: true })
                  }
                  className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                    selected === slot
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-slate-200 text-slate-700 hover:border-brand-400 hover:text-brand-600"
                  }`}
                >
                  {fmtTime(slot, zone)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {selected ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-center text-xs text-slate-600">
          <span className="font-semibold text-slate-800">
            {fmtDateTime(selected, zone, { withZone: true })}
          </span>{" "}
          your time
          {showTutorTime ? (
            <>
              {" · "}
              {fmtDateTime(selected, tutorZone, { withZone: true })} for{" "}
              {tutorName ?? "your tutor"}
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
