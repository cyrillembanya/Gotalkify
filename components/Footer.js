"use client";

import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import NewsletterForm from "./NewsletterForm";

export default function Footer() {
  const t = useTranslations("footer");

  const columns = [
    {
      title: t("learn"),
      links: [
        { href: "/english-lessons", label: t("englishLessons") },
        { href: "/french-lessons", label: t("frenchLessons") },
        { href: "/corporate-training", label: t("corporate") },
        { href: "/tutors", label: t("findTutor") },
      ],
    },
    {
      title: t("company"),
      links: [
        { href: "/about", label: t("about") },
        { href: "/how-it-works", label: t("howItWorks") },
        { href: "/blog", label: t("blog") },
        { href: "/contact", label: t("contact") },
      ],
    },
    {
      title: t("more"),
      links: [
        { href: "/apply", label: t("becomeTutor") },
        { href: "/faqs", label: t("faqs") },
        { href: "/privacy", label: t("privacy") },
        { href: "/terms", label: t("terms") },
      ],
    },
  ];

  return (
    <footer className="bg-slate-900 text-slate-300">
      <div className="container-page grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <div className="inline-flex items-center rounded-lg bg-slate-50 px-3 py-2">
            <Image
              src="/logo.avif"
              alt="GoTalkify"
              width={108}
              height={36}
              className="h-8 w-auto"
            />
          </div>
          <p className="mt-4 max-w-sm text-sm text-slate-400">{t("tagline")}</p>
          <div className="mt-6">
            <p className="mb-2 text-sm font-semibold text-white">{t("newsletterTitle")}</p>
            <NewsletterForm />
          </div>
        </div>
        {columns.map((column) => (
          <div key={column.title}>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-accent-300">
              {column.title}
            </p>
            <ul className="space-y-2">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-slate-300 transition-colors hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-800">
        <div className="container-page flex flex-col items-center justify-between gap-2 py-6 text-xs text-slate-400 sm:flex-row">
          <p>© {new Date().getFullYear()} GoTalkify. {t("rights")}</p>
          <p className="font-semibold uppercase tracking-[0.15em] text-accent-300">
            {t("madeWith")}
          </p>
        </div>
      </div>
    </footer>
  );
}
