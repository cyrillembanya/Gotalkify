"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import StarRating from "@/components/StarRating";
import { BookingPanel, MessageButton } from "@/components/BookingPanel";
import { fmtMoney, fmtDate } from "@/lib/format";
import { useViewerTimezone } from "@/lib/useViewerTimezone";

export default function TutorProfilePage() {
  const timezone = useViewerTimezone();
  const params = useParams();
  const profile = useQuery(api.tutors.getById, { profileId: params.id });

  if (profile === undefined) {
    return <div className="container-page py-20 text-center text-slate-500">Loading…</div>;
  }
  if (profile === null) {
    return (
      <div className="container-page py-20 text-center">
        <p className="font-semibold text-slate-700">Tutor not found.</p>
        <Link href="/tutors" className="btn-primary mt-4">Browse tutors</Link>
      </div>
    );
  }

  return (
    <div className="bg-slate-50">
      <div className="container-page grid gap-8 py-10 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card flex flex-col gap-5 sm:flex-row">
            {profile.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.photoUrl}
                alt={profile.name}
                className="h-32 w-32 shrink-0 rounded-2xl object-cover"
              />
            ) : (
              <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-4xl font-bold text-brand-700">
                {profile.name.charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-slate-900">{profile.name}</h1>
              {profile.headline ? (
                <p className="mt-1 text-slate-600">{profile.headline}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {profile.languagesTaught.map((lang) => (
                  <span key={lang} className="badge-blue">
                    Teaches {lang === "en" ? "English" : "French"}
                  </span>
                ))}
                {profile.nativeLanguages.length > 0 ? (
                  <span className="badge-gray">
                    Native: {profile.nativeLanguages.join(", ")}
                  </span>
                ) : null}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <StarRating value={profile.rating ?? 0} size="h-4 w-4" />
                <span className="text-sm text-slate-500">
                  {profile.reviewCount
                    ? `${profile.rating} · ${profile.reviewCount} review${profile.reviewCount > 1 ? "s" : ""}`
                    : "New tutor"}
                </span>
                <span className="text-lg font-bold text-slate-900">
                  {fmtMoney(profile.hourlyRateCents)}
                  <span className="text-sm font-normal text-slate-500">/hour</span>
                </span>
              </div>
            </div>
          </div>

          {profile.introVideoUrl ? (
            <div className="card">
              <h2 className="mb-3 font-bold text-slate-900">Intro video</h2>
              <video
                controls
                preload="metadata"
                className="w-full rounded-lg bg-slate-900"
                src={profile.introVideoUrl}
              />
            </div>
          ) : null}

          <div className="card">
            <h2 className="mb-3 font-bold text-slate-900">About me</h2>
            <p className="whitespace-pre-line text-sm leading-6 text-slate-600">{profile.bio}</p>
            {profile.specialties.length > 0 ? (
              <>
                <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-800">Specialties</h3>
                <div className="flex flex-wrap gap-1.5">
                  {profile.specialties.map((s) => (
                    <span key={s} className="badge-gray">{s}</span>
                  ))}
                </div>
              </>
            ) : null}
            {profile.qualifications ? (
              <>
                <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-800">Qualifications</h3>
                <p className="whitespace-pre-line text-sm text-slate-600">{profile.qualifications}</p>
              </>
            ) : null}
          </div>

          <div className="card">
            <h2 className="mb-3 font-bold text-slate-900">
              Reviews {profile.reviewCount ? `(${profile.reviewCount})` : ""}
            </h2>
            {profile.reviews.length === 0 ? (
              <p className="text-sm text-slate-500">
                No reviews yet — be the first after your lesson!
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {profile.reviews.map((review) => (
                  <li key={review._id} className="py-4">
                    <div className="flex items-center gap-2">
                      <StarRating value={review.rating} size="h-4 w-4" />
                      <span className="text-sm font-semibold text-slate-800">
                        {review.studentName}
                      </span>
                      <span className="text-xs text-slate-400">
                        {fmtDate(review.createdAt, timezone)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{review.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <BookingPanel profile={profile} />
          <MessageButton profile={profile} />
        </div>
      </div>
    </div>
  );
}
