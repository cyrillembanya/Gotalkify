"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import TutorCard from "./TutorCard";

/** Home-page featured tutors: live Convex data, loading skeletons, empty state. */
export default function FeaturedTutors() {
  const t = useTranslations("home");
  const tutors = useQuery(api.tutors.list, {});

  return (
    <div>
      {tutors === undefined ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-full bg-slate-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-2/3 rounded bg-slate-200" />
                  <div className="h-3 w-1/3 rounded bg-slate-200" />
                </div>
              </div>
              <div className="mt-4 h-3 w-full rounded bg-slate-200" />
              <div className="mt-2 h-3 w-4/5 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      ) : tutors.length === 0 ? (
        <div className="card mx-auto max-w-xl text-center">
          <span
            aria-hidden="true"
            className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-2xl"
          >
            🎓
          </span>
          <p className="text-slate-600">{t("featuredEmpty")}</p>
          <Link href="/tutors" className="btn-secondary mt-4">
            {t("featuredViewAll")}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {tutors.slice(0, 4).map((tutor) => (
            <TutorCard key={tutor._id} tutor={tutor} />
          ))}
        </div>
      )}

      {tutors && tutors.length > 0 ? (
        <div className="mt-10 text-center">
          <Link href="/tutors" className="btn-secondary">
            {t("featuredViewAll")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
