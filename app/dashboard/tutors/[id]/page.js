"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import StarRating from "@/components/StarRating";
import { BookingPanel, MessageButton } from "@/components/BookingPanel";
import { SectionCard, EmptyState, LoadingRows } from "@/components/dashboard/ui";
import { fmtMoney, fmtDate } from "@/lib/format";
import { ArrowLeft, UserRoundX } from "lucide-react";

export default function DashboardTutorProfilePage() {
  const params = useParams();
  const profile = useQuery(api.tutors.getById, { profileId: params.id });

  if (profile === undefined) {
    return (
      <div className="card">
        <LoadingRows rows={4} />
      </div>
    );
  }
  if (profile === null) {
    return (
      <div className="card">
        <EmptyState
          icon={UserRoundX}
          title="Tutor not found"
          message="This tutor may no longer be available."
          action="Back to tutors"
          href="/dashboard/tutors"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/tutors"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition-colors hover:text-brand-700"
      >
        <ArrowLeft className="h-4 w-4" /> All tutors
      </Link>

      <div className="grid gap-6 lg:grid-cols-3">
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
            <SectionCard title="Intro video">
              <video
                controls
                preload="metadata"
                className="w-full rounded-xl bg-slate-900"
                src={profile.introVideoUrl}
              />
            </SectionCard>
          ) : null}

          <SectionCard title="About me">
            <p className="whitespace-pre-line text-sm leading-6 text-slate-600">
              {profile.bio}
            </p>
            {profile.specialties.length > 0 ? (
              <>
                <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-800">
                  Specialties
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {profile.specialties.map((s) => (
                    <span key={s} className="badge-gray">{s}</span>
                  ))}
                </div>
              </>
            ) : null}
            {profile.qualifications ? (
              <>
                <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-800">
                  Qualifications
                </h3>
                <p className="whitespace-pre-line text-sm text-slate-600">
                  {profile.qualifications}
                </p>
              </>
            ) : null}
          </SectionCard>

          <SectionCard
            title={`Reviews ${profile.reviewCount ? `(${profile.reviewCount})` : ""}`}
          >
            {profile.reviews.length === 0 ? (
              <p className="text-sm text-slate-500">
                No reviews yet — be the first after your lesson!
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {profile.reviews.map((review) => (
                  <li key={review._id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2">
                      <StarRating value={review.rating} size="h-4 w-4" />
                      <span className="text-sm font-semibold text-slate-800">
                        {review.studentName}
                      </span>
                      <span className="text-xs text-slate-400">
                        {fmtDate(review.createdAt, "UTC")}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{review.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <BookingPanel profile={profile} />
          <MessageButton profile={profile} />
        </div>
      </div>
    </div>
  );
}
