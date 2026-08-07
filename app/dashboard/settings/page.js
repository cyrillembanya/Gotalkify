"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { TIMEZONES } from "@/lib/format";
import {
  PageHeader,
  SectionCard,
  Skeleton,
  ErrorBanner,
} from "@/components/dashboard/ui";
import { CheckCircle2 } from "lucide-react";

export default function SettingsPage() {
  const me = useQuery(api.users.me);
  const updateProfile = useMutation(api.users.updateProfile);
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (me && !form) {
      setForm({
        name: me.name ?? "",
        timezone: me.timezone ?? "UTC",
        locale: me.locale ?? "en",
        learningLanguage: me.learningLanguage ?? "",
        level: me.level ?? "",
        goals: me.goals ?? "",
      });
    }
  }, [me, form]);

  if (!me || !form) {
    return (
      <div className="max-w-2xl space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="card space-y-4">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="card space-y-4">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  const set = (key) => (e) => {
    setForm({ ...form, [key]: e.target.value });
    setSaved(false);
  };

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      await updateProfile({
        name: form.name.trim() || undefined,
        timezone: form.timezone,
        locale: form.locale,
        learningLanguage: form.learningLanguage || undefined,
        level: form.level || undefined,
        goals: form.goals || undefined,
      });
      setSaved(true);
    } catch {
      setError("Could not save settings.");
    }
  }

  const isStudent = me.role === "student";
  const options = TIMEZONES.includes(form.timezone)
    ? TIMEZONES
    : [form.timezone, ...TIMEZONES];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Your profile, preferences and learning goals."
      />

      <form onSubmit={onSubmit} className="max-w-2xl space-y-6">
        <SectionCard title="Profile">
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="name">Full name</label>
              <input id="name" className="input" value={form.name} onChange={set("name")} />
            </div>
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" className="input bg-slate-50" value={me.email ?? ""} disabled />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Preferences">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="timezone">Timezone</label>
              <select id="timezone" className="input" value={form.timezone} onChange={set("timezone")}>
                {options.map((tz) => (
                  <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="locale">Interface language</label>
              <select id="locale" className="input" value={form.locale} onChange={set("locale")}>
                <option value="en">English</option>
                <option value="fr">Français</option>
              </select>
            </div>
          </div>
        </SectionCard>

        {isStudent ? (
          <SectionCard title="Learning">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="learning">Learning language</label>
                  <select
                    id="learning"
                    className="input"
                    value={form.learningLanguage}
                    onChange={set("learningLanguage")}
                  >
                    <option value="">—</option>
                    <option value="en">English</option>
                    <option value="fr">French</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="level">Current level</label>
                  <select id="level" className="input" value={form.level} onChange={set("level")}>
                    <option value="">—</option>
                    {["A1", "A2", "B1", "B2", "C1", "C2"].map((level) => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="goals">Learning goals</label>
                <textarea
                  id="goals"
                  rows={3}
                  className="input"
                  placeholder="e.g. Pass IELTS with 7.5, feel confident in meetings…"
                  value={form.goals}
                  onChange={set("goals")}
                />
              </div>
            </div>
          </SectionCard>
        ) : null}

        <ErrorBanner message={error} onDismiss={() => setError(null)} />
        <div className="flex items-center gap-3">
          <button className="btn-primary">Save settings</button>
          {saved ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600">
              <CheckCircle2 className="h-4 w-4" /> Settings saved
            </span>
          ) : null}
        </div>
      </form>
    </div>
  );
}
