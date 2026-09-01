"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { WEEKDAYS, minutesToHHMM, fmtDate } from "@/lib/format";
import { zoneLabel, zonedDateString, startOfZonedDay } from "@/lib/tz";
import {
  PageHeader,
  SectionCard,
  EmptyState,
  LoadingRows,
  ErrorBanner,
} from "@/components/dashboard/ui";
import { CalendarOff, Lock, Plus, X } from "lucide-react";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first, Sunday-indexed
const TIME_OPTIONS = [];
for (let m = 0; m <= 1410; m += 30) TIME_OPTIONS.push(m);

function cleanError(err) {
  if (typeof err?.data === "string" && err.data.trim()) return err.data.trim();
  return String(err?.message ?? err)
    .replace(/^.*Uncaught (ConvexError|Error):\s*/, "")
    .split("\n")[0];
}

/** "Today" on the tutor's own calendar — they may be editing from elsewhere. */
function todayStr(timezone) {
  return zonedDateString(Date.now(), timezone);
}

function TimeSelect({ value, onChange }) {
  return (
    <select
      className="input w-auto py-2"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {TIME_OPTIONS.map((m) => (
        <option key={m} value={m}>
          {minutesToHHMM(m)}
        </option>
      ))}
    </select>
  );
}

export default function AvailabilityPage() {
  const me = useQuery(api.users.me);
  const data = useQuery(api.availability.mine, me?.role === "tutor" ? {} : "skip");
  const saveRules = useMutation(api.availability.saveRules);
  const addOverride = useMutation(api.availability.addOverride);
  const removeOverride = useMutation(api.availability.removeOverride);

  const [windows, setWindows] = useState(null); // local-time editor state
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // { kind: "ok"|"err", text }

  // Override form
  const [ovDate, setOvDate] = useState(null);
  const [ovType, setOvType] = useState("extra");
  const [ovStart, setOvStart] = useState(540);
  const [ovEnd, setOvEnd] = useState(1020);
  const [ovMessage, setOvMessage] = useState(null);
  const [ovSaving, setOvSaving] = useState(false);

  // `availability.mine` already answers in the tutor's timezone — the windows
  // are their own wall-clock hours, and the server resolves each occurrence to
  // an instant (correct in both DST seasons) when students view the calendar.
  useEffect(() => {
    if (windows === null && data) setWindows(data.rules);
  }, [data, windows]);

  useEffect(() => {
    if (ovDate === null && data) setOvDate(todayStr(data.timezone));
  }, [data, ovDate]);

  if (me && me.role !== "tutor") {
    return (
      <div className="space-y-6">
        <PageHeader title="Availability" />
        <div className="card">
          <EmptyState
            compact
            icon={Lock}
            title="Tutors only"
            message="This page is for tutors only."
          />
        </div>
      </div>
    );
  }
  if (me === undefined || !me || data === undefined || windows === null || ovDate === null) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Availability"
          description="Set the hours students can book lessons with you."
        />
        <div className="card">
          <LoadingRows rows={4} />
        </div>
      </div>
    );
  }

  const updateWindow = (index, patch) => {
    setWindows((ws) => ws.map((w, i) => (i === index ? { ...w, ...patch } : w)));
  };
  const removeWindow = (index) => {
    setWindows((ws) => ws.filter((_, i) => i !== index));
  };
  const addWindow = (weekday) => {
    setWindows((ws) => [...ws, { weekday, startMinute: 540, endMinute: 1020 }]);
  };

  const handleSave = async () => {
    setMessage(null);
    for (const w of windows) {
      if (w.startMinute >= w.endMinute) {
        setMessage({
          kind: "err",
          text: `Invalid window on ${WEEKDAYS[w.weekday]}: start must be before end.`,
        });
        return;
      }
    }
    setSaving(true);
    try {
      const result = await saveRules({ rules: windows, timezone: data.timezone });
      // The server merges duplicate/overlapping windows — show the result.
      setWindows(result.rules);
      setMessage({ kind: "ok", text: "Availability saved." });
    } catch (err) {
      setMessage({ kind: "err", text: cleanError(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleAddOverride = async (e) => {
    e.preventDefault();
    setOvMessage(null);
    if (ovStart >= ovEnd) {
      setOvMessage({ kind: "err", text: "Start time must be before end time." });
      return;
    }
    setOvSaving(true);
    try {
      // Sent as the tutor's own date and wall-clock minutes; the backend keeps
      // them in that zone, so 09:00 means 09:00 wherever the editing happened.
      await addOverride({
        date: ovDate,
        type: ovType,
        startMinute: ovStart,
        endMinute: ovEnd,
      });
      setOvMessage({ kind: "ok", text: "Override added." });
    } catch (err) {
      setOvMessage({ kind: "err", text: cleanError(err) });
    } finally {
      setOvSaving(false);
    }
  };

  const handleRemoveOverride = async (overrideId) => {
    try {
      await removeOverride({ overrideId });
    } catch (err) {
      setOvMessage({ kind: "err", text: cleanError(err) });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Availability"
        description={`Set the hours students can book lessons with you, in your own time (${zoneLabel(
          data.timezone
        )}). Students see every slot converted to their own timezone.`}
      >
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save availability"}
        </button>
      </PageHeader>

      <SectionCard title="Weekly recurring hours">
        <p className="mb-5 text-sm text-slate-500">
          Lessons are 60 minutes; students can book any full hour inside your
          windows. These hours stay put when the clocks change — 09:00 is 09:00
          for you all year.
        </p>

        <div className="space-y-4">
          {DAY_ORDER.map((weekday) => {
            const dayWindows = windows
              .map((w, index) => ({ ...w, index }))
              .filter((w) => w.weekday === weekday)
              .sort((a, b) => a.startMinute - b.startMinute);
            return (
              <div key={weekday} className="border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                <div className="mb-2.5 flex items-center justify-between gap-3">
                  <span className="font-bold text-slate-900">
                    {WEEKDAYS[weekday]}
                  </span>
                  <button
                    type="button"
                    className="btn-secondary gap-1.5 px-4 py-2 text-sm"
                    onClick={() => addWindow(weekday)}
                  >
                    <Plus className="h-4 w-4" /> Add hours
                  </button>
                </div>
                {dayWindows.length === 0 ? (
                  <p className="py-2 text-sm text-slate-400">Unavailable</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {dayWindows.map((w) => (
                      <div
                        key={w.index}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 py-2 pl-2 pr-1"
                      >
                        <TimeSelect
                          value={w.startMinute}
                          onChange={(v) => updateWindow(w.index, { startMinute: v })}
                        />
                        <span className="text-sm text-slate-400">to</span>
                        <TimeSelect
                          value={w.endMinute}
                          onChange={(v) => updateWindow(w.index, { endMinute: v })}
                        />
                        <button
                          type="button"
                          aria-label={`Remove ${WEEKDAYS[weekday]} window`}
                          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                          onClick={() => removeWindow(w.index)}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-5 space-y-3">
          {message?.kind === "err" ? (
            <ErrorBanner message={message.text} onDismiss={() => setMessage(null)} />
          ) : message ? (
            <p className="text-sm font-medium text-green-600">{message.text}</p>
          ) : null}
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save availability"}
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Date overrides">
        <p className="mb-5 text-sm text-slate-500">
          Add extra hours or block time on specific dates.
        </p>
        <form
          onSubmit={handleAddOverride}
          className="flex flex-wrap items-end gap-3"
        >
          <div>
            <label className="label">Date</label>
            <input
              type="date"
              className="input py-2"
              min={todayStr(data.timezone)}
              value={ovDate}
              onChange={(e) => setOvDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Type</label>
            <select
              className="input py-2"
              value={ovType}
              onChange={(e) => setOvType(e.target.value)}
            >
              <option value="extra">Extra hours</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>
          <div>
            <label className="label">Start</label>
            <TimeSelect value={ovStart} onChange={setOvStart} />
          </div>
          <div>
            <label className="label">End</label>
            <TimeSelect value={ovEnd} onChange={setOvEnd} />
          </div>
          <button className="btn-secondary" type="submit" disabled={ovSaving}>
            {ovSaving ? "Adding…" : "Add override"}
          </button>
        </form>
        {ovMessage?.kind === "err" ? (
          <div className="mt-4">
            <ErrorBanner message={ovMessage.text} onDismiss={() => setOvMessage(null)} />
          </div>
        ) : ovMessage ? (
          <p className="mt-3 text-sm font-medium text-green-600">{ovMessage.text}</p>
        ) : null}

        {data.overrides.length === 0 ? (
          <EmptyState
            compact
            icon={CalendarOff}
            title="No date overrides"
            message="Overrides you add for specific dates will show up here."
          />
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Time ({zoneLabel(data.timezone)})</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.overrides.map((o) => (
                  <tr key={o._id} className="transition-colors hover:bg-slate-50">
                    <td className="font-medium text-slate-800">
                      {fmtDate(startOfZonedDay(o.date, data.timezone), data.timezone)}
                    </td>
                    <td>
                      {o.type === "extra" ? (
                        <span className="badge-green">Extra hours</span>
                      ) : (
                        <span className="badge-red">Blocked</span>
                      )}
                    </td>
                    <td>
                      {minutesToHHMM(o.startMinute)}–{minutesToHHMM(o.endMinute)}
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="btn-ghost px-4 py-2 text-sm text-red-600"
                        onClick={() => handleRemoveOverride(o._id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
