"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { TIMEZONES, browserTimezone } from "@/lib/format";

/** Dashboard-top timezone selector — all displayed times follow it. */
export default function TimezoneSelector({ timezone }) {
  const setTimezone = useMutation(api.users.setTimezone);
  const detected = browserTimezone();
  const options = TIMEZONES.includes(timezone)
    ? TIMEZONES
    : [timezone, ...TIMEZONES];

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0" />
      </svg>
      <select
        value={timezone}
        onChange={(e) => setTimezone({ timezone: e.target.value })}
        className="input w-auto py-1.5"
        aria-label="Timezone"
      >
        {options.map((tz) => (
          <option key={tz} value={tz}>
            {tz.replace(/_/g, " ")}
          </option>
        ))}
      </select>
      {detected && detected !== timezone ? (
        <button
          className="text-xs font-medium text-brand-600 hover:underline"
          onClick={() => setTimezone({ timezone: detected })}
        >
          Use {detected.replace(/_/g, " ")}
        </button>
      ) : null}
    </div>
  );
}
