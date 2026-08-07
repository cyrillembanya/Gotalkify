"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import StarRating from "@/components/StarRating";
import { fmtMoney } from "@/lib/format";
import { PageHeader, EmptyState, Skeleton } from "@/components/dashboard/ui";
import { Search, UsersRound, Clock } from "lucide-react";

function TutorCard({ tutor, hoursLeft }) {
  return (
    <Link
      href={`/dashboard/tutors/${tutor._id}`}
      className="card group flex gap-4 !p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      {tutor.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={tutor.photoUrl}
          alt={tutor.name}
          className="h-20 w-20 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-2xl font-bold text-brand-700">
          {tutor.name.charAt(0)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-bold text-slate-900 group-hover:text-brand-700">
              {tutor.name}
            </h3>
            <div className="mt-1 flex flex-wrap gap-1">
              {tutor.languagesTaught.map((lang) => (
                <span key={lang} className="badge-blue">
                  {lang === "en" ? "English" : "French"}
                </span>
              ))}
              {hoursLeft > 0 ? (
                <span className="badge-green inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {hoursLeft.toFixed(1)}h left
                </span>
              ) : null}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-bold text-slate-900">{fmtMoney(tutor.hourlyRateCents)}</p>
            <p className="text-xs text-slate-500">per hour</p>
          </div>
        </div>
        <p className="mt-2 line-clamp-2 text-sm text-slate-600">
          {tutor.headline || tutor.bio}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <StarRating value={tutor.rating ?? 0} size="h-4 w-4" />
          <span className="text-xs text-slate-500">
            {tutor.reviewCount ? `${tutor.rating} (${tutor.reviewCount})` : "New tutor"}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function DashboardTutorsPage() {
  const [language, setLanguage] = useState("");
  const [maxRate, setMaxRate] = useState("");
  const [search, setSearch] = useState("");

  const tutors = useQuery(api.tutors.list, {
    language: language || undefined,
    maxRateCents: maxRate ? Number(maxRate) * 100 : undefined,
    search: search || undefined,
  });
  const balances = useQuery(api.balances.mine);
  const hoursByTutor = new Map(
    (balances ?? []).map((b) => [b.tutorId, b.minutesRemaining / 60])
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Find tutors"
        description="Browse native English and French tutors and book directly from your dashboard."
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or specialty…"
            className="input pl-10"
            aria-label="Search tutors"
          />
        </div>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="input w-auto"
          aria-label="Language"
        >
          <option value="">All languages</option>
          <option value="en">English</option>
          <option value="fr">French</option>
        </select>
        <select
          value={maxRate}
          onChange={(e) => setMaxRate(e.target.value)}
          className="input w-auto"
          aria-label="Max price"
        >
          <option value="">Any price</option>
          <option value="15">Up to $15/h</option>
          <option value="25">Up to $25/h</option>
          <option value="40">Up to $40/h</option>
          <option value="60">Up to $60/h</option>
        </select>
      </div>

      {tutors === undefined ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card flex gap-4 !p-5">
              <Skeleton className="h-20 w-20 rounded-xl" />
              <div className="flex-1 space-y-2 py-1">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : tutors.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={UsersRound}
            title="No tutors match your filters"
            message="Try widening your search — or check back soon, new tutors join every week."
          />
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {tutors.map((tutor) => (
            <TutorCard
              key={tutor._id}
              tutor={tutor}
              hoursLeft={tutor.userId ? hoursByTutor.get(tutor.userId) ?? 0 : 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
