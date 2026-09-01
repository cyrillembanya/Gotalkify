"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { TIMEZONES, zoneAbbreviation } from "@/lib/format";
import { offsetLabel } from "@/lib/tz";
import { useViewerTimezoneDetails } from "@/lib/useViewerTimezone";

/**
 * Dashboard-top timezone selector — every displayed time follows it.
 *
 * It normally shows the zone detected from the browser; picking one by hand
 * pins it (someone travelling can stay on home time), and the pin can be
 * dropped again with one click.
 */
export default function TimezoneSelector() {
  const setTimezone = useMutation(api.users.setTimezone);
  const followDevice = useMutation(api.users.followDeviceTimezone);
  const { timezone, detected, source } = useViewerTimezoneDetails();
  const options = TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES];
  const pinned = source === "manual";
  const now = Date.now();

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
        aria-label="Timezone — all times on GoTalkify are shown in it"
        title={`All times are shown in ${timezone.replace(/_/g, " ")} (${offsetLabel(timezone, now)})`}
      >
        {options.map((tz) => (
          <option key={tz} value={tz}>
            {tz.replace(/_/g, " ")}
          </option>
        ))}
      </select>
      <span className="hidden text-xs font-medium text-slate-400 sm:inline">
        {zoneAbbreviation(timezone, now)}
      </span>
      {pinned && detected && detected !== timezone ? (
        <button
          className="text-xs font-medium text-brand-600 hover:underline"
          onClick={() => followDevice({ timezone: detected })}
          title="Follow the timezone of the device you're using"
        >
          Use {detected.replace(/_/g, " ")}
        </button>
      ) : null}
    </div>
  );
}
