"use client";

import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { fmtMoney } from "@/lib/format";

const LANG_KEYS = { en: "langEn", fr: "langFr" };

/** Compact tutor card for the featured-tutors section. Links to /tutors. */
export default function TutorCard({ tutor }) {
  const t = useTranslations("common");

  return (
    <Link
      href="/tutors"
      className="card group flex flex-col gap-4 transition-shadow hover:shadow-lg"
    >
      <div className="flex items-center gap-4">
        {tutor.photoUrl ? (
          <Image
            src={tutor.photoUrl}
            alt={tutor.name}
            width={56}
            height={56}
            className="h-14 w-14 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-700">
            {(tutor.name || "?").charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900 group-hover:text-brand-700">
            {tutor.name}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {(tutor.languagesTaught || []).map((lang) =>
              LANG_KEYS[lang] ? (
                <span key={lang} className="badge-blue">
                  {t(LANG_KEYS[lang])}
                </span>
              ) : null
            )}
          </div>
        </div>
      </div>

      {tutor.headline ? (
        <p className="line-clamp-2 text-sm text-slate-600">{tutor.headline}</p>
      ) : null}

      <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
        <span className="flex items-center gap-1 font-medium text-slate-700">
          <svg
            aria-hidden="true"
            className="h-4 w-4 text-yellow-400"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.958a1 1 0 00.95.69h4.163c.969 0 1.371 1.24.588 1.81l-3.368 2.447a1 1 0 00-.363 1.118l1.286 3.958c.3.922-.755 1.688-1.539 1.118L10.583 15.58a1 1 0 00-1.176 0l-3.368 2.447c-.783.57-1.838-.196-1.538-1.118l1.286-3.958a1 1 0 00-.363-1.118L2.055 9.385c-.783-.57-.38-1.81.588-1.81h4.163a1 1 0 00.95-.69l1.293-3.958z" />
          </svg>
          {tutor.rating ? tutor.rating.toFixed(1) : "—"}
          {tutor.reviewCount ? (
            <span className="font-normal text-slate-400">({tutor.reviewCount})</span>
          ) : null}
        </span>
        <span className="font-semibold text-slate-900">
          {fmtMoney(tutor.hourlyRateCents)}
          <span className="font-normal text-slate-500">{t("perHour")}</span>
        </span>
      </div>
    </Link>
  );
}
