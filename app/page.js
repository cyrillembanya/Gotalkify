import Link from "next/link";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import SectionHeading from "@/components/marketing/SectionHeading";
import CTABanner from "@/components/marketing/CTABanner";
import FeaturedTutors from "@/components/marketing/FeaturedTutors";
import Testimonials from "@/components/marketing/Testimonials";

export async function generateMetadata() {
  const t = await getTranslations("home");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

function CheckIcon({ className = "h-4 w-4" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
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
      <section className="relative overflow-hidden bg-gradient-to-b from-slate-100 to-slate-50">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 -top-40 h-[30rem] w-[30rem] rounded-full bg-accent-200/40 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 -left-40 h-[26rem] w-[26rem] rounded-full bg-brand-100/60 blur-3xl"
        />

        <div className="container-page relative grid items-center gap-14 py-16 lg:grid-cols-2 lg:gap-16 lg:py-24">
          <div className="text-center lg:text-left">
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-[3.5rem] lg:leading-[1.05]">
              {t("heroTitle")}
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-slate-600 lg:mx-0">
              {t("heroSubtitle")}
            </p>

            <ul className="mt-7 flex flex-wrap justify-center gap-x-6 gap-y-2 lg:justify-start">
              {[t("value1t"), t("value2t"), t("value3t")].map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-100 text-accent-600">
                    <CheckIcon className="h-3 w-3" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>

            <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Link href="/tutors" className="btn-primary px-8 py-3 text-base">
                {t("heroCtaPrimary")}
              </Link>
              <Link href="/tutors" className="btn-secondary px-8 py-3 text-base">
                {t("heroCtaSecondary")}
              </Link>
            </div>
            <p className="mt-5 text-sm text-slate-500">{t("heroNote")}</p>
          </div>

          <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
            <div className="overflow-hidden rounded-3xl bg-white p-2 shadow-card ring-1 ring-slate-200/70">
              <Image
                src="/img2.jpg"
                alt={t("heroImageAlt")}
                width={612}
                height={408}
                priority
                sizes="(min-width: 1024px) 42vw, (min-width: 640px) 80vw, 100vw"
                className="h-auto w-full rounded-2xl object-cover"
              />
            </div>

            <div className="absolute -bottom-6 left-4 rounded-2xl border border-slate-100 bg-white/95 px-5 py-3 shadow-card backdrop-blur sm:left-8">
              <p className="text-2xl font-extrabold text-brand-600">{t("stat2v")}</p>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {t("stat2l")}
              </p>
            </div>
            <div className="absolute -right-2 top-6 hidden rounded-2xl border border-slate-100 bg-white/95 px-4 py-3 shadow-card backdrop-blur sm:block">
              <p className="text-lg font-extrabold text-brand-600">{t("stat1v")}</p>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {t("stat1l")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-y border-slate-200/70 bg-white">
        <div className="container-page grid grid-cols-2 gap-y-8 py-12 text-center lg:grid-cols-4 lg:divide-x lg:divide-slate-200/70">
          {stats.map((stat) => (
            <div key={stat.label} className="px-4">
              <p className="text-3xl font-extrabold text-brand-600 sm:text-4xl">{stat.value}</p>
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
            <div
              key={value.title}
              className="card transition-shadow duration-200 hover:shadow-lg"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-100">
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
        <div className="container-page grid items-center gap-14 py-20 lg:grid-cols-2 lg:gap-16">
          <div className="order-last lg:order-first">
            <div className="overflow-hidden rounded-3xl bg-white p-2 shadow-card ring-1 ring-slate-200/70">
              <Image
                src="/img1.jpg"
                alt={t("howImageAlt")}
                width={540}
                height={360}
                sizes="(min-width: 1024px) 42vw, (min-width: 640px) 80vw, 100vw"
                className="h-auto w-full rounded-2xl object-cover"
              />
            </div>
          </div>

          <div>
            <SectionHeading title={t("howTitle")} subtitle={t("howSubtitle")} align="left" />
            <ol className="mt-10 space-y-8">
              {steps.map((step, index) => (
                <li key={step.title} className="relative flex gap-5">
                  {index < steps.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className="absolute left-[1.4rem] top-12 h-[calc(100%-1rem)] w-px bg-slate-200"
                    />
                  ) : null}
                  <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-base font-bold text-white ring-4 ring-slate-50">
                    {index + 1}
                  </span>
                  <div className="pt-1">
                    <h3 className="font-semibold text-slate-900">{step.title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-slate-600">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <Link
              href="/how-it-works"
              className="mt-8 inline-flex font-medium text-brand-600 hover:text-brand-700"
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
