"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import StarRating from "@/components/StarRating";
import { fmtMoney } from "@/lib/format";

function TutorCard({ tutor }) {
  const t = useTranslations("common");
  return (
    <Link
      href={`/tutors/${tutor._id}`}
      className="card flex gap-4 transition-shadow hover:shadow-lg"
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
          <div>
            <h3 className="font-bold text-slate-900">{tutor.name}</h3>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {tutor.languagesTaught.map((lang) => (
                <span key={lang} className="badge-blue">
                  {lang === "en" ? "English" : "French"}
                </span>
              ))}
              {tutor.flaggedForCancellations ? null : null}
            </div>
          </div>
          <div className="text-right">
            <p className="font-bold text-slate-900">{fmtMoney(tutor.hourlyRateCents)}</p>
            <p className="text-xs text-slate-500">{t("perHour")}</p>
          </div>
        </div>
        {tutor.headline ? (
          <p className="mt-2 line-clamp-2 text-sm text-slate-600">{tutor.headline}</p>
        ) : (
          <p className="mt-2 line-clamp-2 text-sm text-slate-600">{tutor.bio}</p>
        )}
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

export default function TutorsPage() {
  const [language, setLanguage] = useState("");
  const [maxRate, setMaxRate] = useState("");
  const [search, setSearch] = useState("");

  const tutors = useQuery(api.tutors.list, {
    language: language || undefined,
    maxRateCents: maxRate ? Number(maxRate) * 100 : undefined,
    search: search || undefined,
  });

  return (
    <div className="bg-slate-50">
      <div className="border-b border-slate-100 bg-white">
        <div className="container-page py-10">
          <h1 className="section-title">Find your tutor</h1>
          <p className="section-subtitle">
            Professional native English and French tutors. Watch their intro videos,
            check availability and book a trial lesson.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
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
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or specialty…"
              className="input w-full sm:w-64"
            />
          </div>
        </div>
      </div>

      <div className="container-page py-10">
        {tutors === undefined ? (
          <p className="py-16 text-center text-slate-500">Loading tutors…</p>
        ) : tutors.length === 0 ? (
          <div className="card mx-auto max-w-lg py-12 text-center">
            <p className="font-semibold text-slate-700">No tutors match your filters yet.</p>
            <p className="mt-2 text-sm text-slate-500">
              Try widening your search — or check back soon, new tutors join every week.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {tutors.map((tutor) => (
              <TutorCard key={tutor._id} tutor={tutor} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
