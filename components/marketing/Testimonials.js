"use client";

import Image from "next/image";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";

/**
 * Testimonials grid. Uses published testimonials from Convex when available,
 * otherwise falls back to three static localized testimonials.
 */
export default function Testimonials() {
  const t = useTranslations("testimonials");
  const data = useQuery(api.marketing.testimonials);

  const fallback = [1, 2, 3].map((i) => ({
    _id: `static-${i}`,
    name: t(`name${i}`),
    role: t(`role${i}`),
    text: t(`text${i}`),
    photoUrl: null,
  }));

  const items = data && data.length > 0 ? data : fallback;

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      {items.slice(0, 6).map((item) => (
        <figure key={item._id} className="card flex flex-col">
          <svg
            aria-hidden="true"
            className="h-8 w-8 text-brand-200"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M9.983 3v7.391C9.983 16.095 6.252 19.961 1 21l-.995-2.151C2.437 17.932 4 15.211 4 13H0V3h9.983zM24 3v7.391C24 16.095 20.269 19.961 15.017 21l-.995-2.151c2.432-.917 3.995-3.638 3.995-5.849h-4V3H24z" />
          </svg>
          <blockquote className="mt-4 flex-1 text-sm leading-6 text-slate-600">
            “{item.text}”
          </blockquote>
          <figcaption className="mt-6 flex items-center gap-3 border-t border-slate-100 pt-4">
            {item.photoUrl ? (
              <Image
                src={item.photoUrl}
                alt={item.name}
                width={40}
                height={40}
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                {(item.name || "?").charAt(0).toUpperCase()}
              </span>
            )}
            <div>
              <p className="text-sm font-semibold text-slate-900">{item.name}</p>
              {item.role ? <p className="text-xs text-slate-500">{item.role}</p> : null}
            </div>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
