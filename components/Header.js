"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useConvexAuth } from "convex/react";
import LocaleSwitcher from "./LocaleSwitcher";

export default function Header() {
  const t = useTranslations("nav");
  const { isAuthenticated } = useConvexAuth();
  const [open, setOpen] = useState(false);

  const links = [
    { href: "/tutors", label: t("tutors") },
    { href: "/how-it-works", label: t("howItWorks") },
    { href: "/english-lessons", label: t("english") },
    { href: "/french-lessons", label: t("french") },
    { href: "/pricing", label: t("pricing") },
    { href: "/blog", label: t("blog") },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-slate-50/95 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center" onClick={() => setOpen(false)}>
          <Image
            src="/logo.avif"
            alt="GoTalkify"
            width={126}
            height={42}
            priority
            className="h-9 w-auto sm:h-10"
          />
        </Link>

        <nav className="hidden items-center gap-6 lg:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-slate-600 transition-colors hover:text-brand-600"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <LocaleSwitcher />
          {isAuthenticated ? (
            <Link href="/dashboard" className="btn-primary">
              {t("dashboard")}
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-medium text-slate-600 hover:text-brand-600"
              >
                {t("login")}
              </Link>
              <Link href="/register" className="btn-primary">
                {t("signup")}
              </Link>
            </>
          )}
        </div>

        <button
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Menu"
          aria-expanded={open}
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {open ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {open ? (
        <div className="border-t border-slate-200 bg-slate-50 px-4 pb-4 lg:hidden">
          <nav className="flex flex-col gap-1 py-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-brand-50 hover:text-brand-700"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3 border-t border-slate-100 pt-3">
            <LocaleSwitcher />
            {isAuthenticated ? (
              <Link href="/dashboard" className="btn-primary flex-1" onClick={() => setOpen(false)}>
                {t("dashboard")}
              </Link>
            ) : (
              <>
                <Link href="/login" className="btn-secondary flex-1" onClick={() => setOpen(false)}>
                  {t("login")}
                </Link>
                <Link href="/register" className="btn-primary flex-1" onClick={() => setOpen(false)}>
                  {t("signup")}
                </Link>
              </>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}
