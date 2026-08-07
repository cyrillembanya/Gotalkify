"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { fmtTime } from "@/lib/format";

/**
 * Bookable-slot picker for a tutor. Slots come from the backend in UTC and
 * are grouped/displayed in the viewer's `timezone`.
 */
export default function SlotPicker({ tutorUserId, timezone, selected, onSelect, days = 14 }) {
  const slots = useQuery(
    api.availability.slots,
    tutorUserId ? { tutorId: tutorUserId, days } : "skip"
  );
  const [page, setPage] = useState(0);

  const grouped = useMemo(() => {
    if (!slots) return [];
    const byDay = new Map();
    for (const slot of slots) {
      const dayLabel = new Intl.DateTimeFormat("en", {
        timeZone: timezone || "UTC",
        weekday: "short",
        day: "numeric",
        month: "short",
      }).format(new Date(slot));
      if (!byDay.has(dayLabel)) byDay.set(dayLabel, []);
      byDay.get(dayLabel).push(slot);
    }
    return [...byDay.entries()];
  }, [slots, timezone]);

  if (slots === undefined) {
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

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          className="btn-ghost px-2 py-1"
          onClick={() => setPage(Math.max(0, page - 1))}
          disabled={page === 0}
          aria-label="Earlier days"
        >
          ←
        </button>
        <span className="text-xs font-medium text-slate-500">
          Times shown in {(timezone || "UTC").replace(/_/g, " ")}
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
                  className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                    selected === slot
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-slate-200 text-slate-700 hover:border-brand-400 hover:text-brand-600"
                  }`}
                >
                  {fmtTime(slot, timezone)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
