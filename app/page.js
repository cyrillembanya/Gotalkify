import Link from "next/link";
import { getTranslations } from "next-intl/server";
import SectionHeading from "@/components/marketing/SectionHeading";
import CTABanner from "@/components/marketing/CTABanner";
import FeaturedTutors from "@/components/marketing/FeaturedTutors";
import Testimonials from "@/components/marketing/Testimonials";

export async function generateMetadata() {
  const t = await getTranslations("home");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

const VALUE_ICONS = [
  // Shield check — vetted native tutors
  <path
    key="v1"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.8}
    d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
  />,
  // User — 1-on-1
  <path
    key="v2"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.8}
    d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z"
  />,
  // Calendar — flexible scheduling
  <path
    key="v3"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.8}
    d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
  />,
  // Scales/heart — fair policies
  <path
    key="v4"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.8}
    d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
  />,
];

export default async function HomePage() {
  const t = await getTranslations("home");

  const stats = [1, 2, 3, 4].map((i) => ({
    value: t(`stat${i}v`),
    label: t(`stat${i}l`),
  }));
  const values = [1, 2, 3, 4].map((i) => ({
    title: t(`value${i}t`),
    text: t(`value${i}d`),
    icon: VALUE_ICONS[i - 1],
  }));
  const steps = [1, 2, 3].map((i) => ({
    title: t(`how${i}t`),
    text: t(`how${i}d`),
  }));

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-b from-slate-100 to-slate-50">
        <div className="container-page py-20 text-center sm:py-28">
          <span className="badge-blue">{t("heroBadge")}</span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            {t("heroTitle")}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
            {t("heroSubtitle")}
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/tutors" className="btn-primary px-8 py-3 text-base">
              {t("heroCtaPrimary")}
            </Link>
            <Link href="/apply" className="btn-secondary px-8 py-3 text-base">
              {t("heroCtaSecondary")}
            </Link>
          </div>
          <p className="mt-6 text-sm text-slate-500">{t("heroNote")}</p>
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-y border-slate-100 bg-white">
        <div className="container-page grid grid-cols-2 gap-8 py-10 text-center lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label}>
              <p className="text-3xl font-extrabold text-brand-600">{stat.value}</p>
              <p className="mt-1 text-sm text-slate-500">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Value props */}
      <section className="container-page py-20">
        <SectionHeading title={t("valueTitle")} subtitle={t("valueSubtitle")} />
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {values.map((value) => (
            <div key={value.title} className="card">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-100">
                <svg
                  aria-hidden="true"
                  className="h-6 w-6 text-brand-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  {value.icon}
                </svg>
              </span>
              <h3 className="mt-4 font-semibold text-slate-900">{value.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{value.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works teaser */}
      <section className="bg-slate-50">
        <div className="container-page py-20">
          <SectionHeading title={t("howTitle")} subtitle={t("howSubtitle")} />
          <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
            {steps.map((step, index) => (
              <div key={step.title} className="card text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white">
                  {index + 1}
                </span>
                <h3 className="mt-4 font-semibold text-slate-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{step.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link
              href="/how-it-works"
              className="font-medium text-brand-600 hover:text-brand-700"
            >
              {t("howLink")} →
            </Link>
          </div>
        </div>
      </section>

      {/* Featured tutors */}
      <section className="container-page py-20">
        <SectionHeading title={t("featuredTitle")} subtitle={t("featuredSubtitle")} />
        <div className="mt-12">
          <FeaturedTutors />
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-slate-50">
        <div className="container-page py-20">
          <SectionHeading
            title={t("testimonialsTitle")}
            subtitle={t("testimonialsSubtitle")}
          />
          <div className="mt-12">
            <Testimonials />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <CTABanner
        title={t("ctaTitle")}
        subtitle={t("ctaSubtitle")}
        buttonLabel={t("ctaButton")}
        href="/tutors"
      />
    </>
  );
}
