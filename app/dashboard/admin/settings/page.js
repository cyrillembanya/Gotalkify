"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cleanError } from "@/components/admin/helpers";
import {
  PageHeader,
  SectionCard,
  Skeleton,
  LoadingRows,
  ErrorBanner,
} from "@/components/dashboard/ui";

const FIELDS = [
  {
    key: "commissionPercent",
    label: "Commission (%)",
    help: "Percentage the platform keeps on each confirmed regular lesson. Trials are always 100% platform revenue. Default 20.",
    min: 0,
    max: 100,
  },
  {
    key: "cancellationWindowHours",
    label: "Cancellation window (hours)",
    help: "How many hours before a lesson starts a student or tutor can cancel/reschedule for free (hour returned to balance). Default 12.",
    min: 0,
  },
  {
    key: "confirmationWindowHours",
    label: "Confirmation window (hours)",
    help: "Hours after a lesson ends before it auto-confirms and the tutor's payout is released, if the student takes no action. Default 72.",
    min: 0,
  },
  {
    key: "minNoticeHours",
    label: "Minimum booking notice (hours)",
    help: "How far in advance a student must book — slots starting sooner than this are not bookable. Default 2.",
    min: 0,
  },
];

export default function AdminSettingsPage() {
  const me = useQuery(api.users.me);
  const isAdmin = !!me && me.role === "admin";
  const settings = useQuery(api.settings.get, isAdmin ? {} : "skip");
  const updateSettings = useMutation(api.settings.update);

  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings && form === null) {
      setForm({
        commissionPercent: String(settings.commissionPercent),
        cancellationWindowHours: String(settings.cancellationWindowHours),
        confirmationWindowHours: String(settings.confirmationWindowHours),
        minNoticeHours: String(settings.minNoticeHours),
      });
    }
  }, [settings, form]);

  if (me === undefined) return <LoadingRows rows={4} />;
  if (!isAdmin) {
    return (
      <div className="card">
        <p className="font-semibold text-slate-800">Admins only</p>
      </div>
    );
  }

  async function onSave(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await updateSettings({
        commissionPercent: Number(form.commissionPercent),
        cancellationWindowHours: Number(form.cancellationWindowHours),
        confirmationWindowHours: Number(form.confirmationWindowHours),
        minNoticeHours: Number(form.minNoticeHours),
      });
      setSaved(true);
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform settings"
        description="Commission and timing rules that govern bookings, cancellations and payouts."
      />

      {settings === undefined || form === null ? (
        <div className="max-w-2xl space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <form onSubmit={onSave} className="max-w-2xl space-y-6">
          {FIELDS.map((field) => (
            <SectionCard key={field.key} title={field.label}>
              <p className="mb-4 -mt-3 text-sm text-slate-500">{field.help}</p>
              <label className="label" htmlFor={`setting-${field.key}`}>
                Value
              </label>
              <input
                id={`setting-${field.key}`}
                className="input max-w-[10rem]"
                type="number"
                min={field.min}
                max={field.max}
                step="1"
                value={form[field.key]}
                onChange={(e) => {
                  setForm({ ...form, [field.key]: e.target.value });
                  setSaved(false);
                }}
                required
              />
            </SectionCard>
          ))}

          <ErrorBanner message={error} onDismiss={() => setError("")} />
          {saved ? (
            <p className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              Settings saved.
            </p>
          ) : null}

          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save settings"}
          </button>
        </form>
      )}
    </div>
  );
}
