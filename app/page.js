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

const GOAL_ICONS = [
  // Chat bubbles — everyday conversation
  <path
    key="g1"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.8}
    d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm3.75 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm3.75 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM21 12c0 4.556-4.03 8.25-9 8.25a9.76 9.76 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
  />,
  // Academic cap — exams and certifications
  <path
    key="g2"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.8}
    d="M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5"
  />,
  // Briefcase — work and business
  <path
    key="g3"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.8}
    d="M20.25 14.15v4.25c0 1.313-.938 2.427-2.243 2.575A48.32 48.32 0 0112 21.5c-2.062 0-4.09-.13-6.007-.382-1.305-.148-2.243-1.262-2.243-2.575V14.15m16.5 0a2.18 2.18 0 00.75-1.65V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 6.006a2.18 2.18 0 01-.75.362 48.4 48.4 0 01-8.25.71 48.4 48.4 0 01-8.25-.71 2.18 2.18 0 01-.75-.362m0 0A2.18 2.18 0 013 12.5V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z"
  />,
  // Globe — travel and moving abroad
  <path
    key="g4"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.8}
    d="M12 21a9 9 0 100-18 9 9 0 000 18zm0 0c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3 7.5 7.03 7.5 12s2.015 9 4.5 9zM3.6 9h16.8M3.6 15h16.8"
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
  const goals = [1, 2, 3, 4].map((i) => ({
    title: t(`goal${i}t`),
    text: t(`goal${i}d`),
    icon: GOAL_ICONS[i - 1],
  }));
  const teamPoints = [1, 2, 3].map((i) => t(`teams${i}`));

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

      {/* Learning goals */}
      <section className="border-y border-slate-200/70 bg-white">
        <div className="container-page grid items-center gap-16 py-20 lg:grid-cols-2 lg:gap-20">
          <div>
            <SectionHeading title={t("goalTitle")} subtitle={t("goalSubtitle")} align="left" />
            <div className="mt-10 grid gap-8 sm:grid-cols-2">
              {goals.map((goal) => (
                <div key={goal.title}>
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-100">
                    <svg
                      aria-hidden="true"
                      className="h-5 w-5 text-brand-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      {goal.icon}
                    </svg>
                  </span>
                  <h3 className="mt-4 font-semibold text-slate-900">{goal.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-slate-600">{goal.text}</p>
                </div>
              ))}
            </div>
            <Link
              href="/tutors"
              className="mt-10 inline-flex font-medium text-brand-600 hover:text-brand-700"
            >
              {t("goalLink")} →
            </Link>
          </div>

          <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
            <div className="overflow-hidden rounded-3xl bg-white p-2 shadow-card ring-1 ring-slate-200/70">
              <Image
                src="/img3.avif"
                alt={t("goalImageAlt")}
                width={740}
                height={493}
                sizes="(min-width: 1024px) 42vw, (min-width: 640px) 80vw, 100vw"
                className="h-auto w-full rounded-2xl object-cover"
              />
            </div>

            <div className="absolute -bottom-8 left-3 w-36 overflow-hidden rounded-2xl bg-white p-1.5 shadow-card ring-1 ring-slate-200/70 sm:-bottom-10 sm:-left-8 sm:w-56 lg:w-64">
              <Image
                src="/img4.jpg"
                alt={t("goalImageAlt2")}
                width={306}
                height={204}
                sizes="(min-width: 1024px) 16rem, (min-width: 640px) 14rem, 9rem"
                className="h-auto w-full rounded-xl object-cover"
              />
            </div>
          </div>
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

      {/* Teams & corporate training */}
      <section className="container-page pb-4">
        <div className="relative overflow-hidden rounded-3xl shadow-card">
          <Image
            src="/img5.avif"
            alt={t("teamsImageAlt")}
            fill
            sizes="(min-width: 1280px) 1200px, 100vw"
            className="object-cover object-center"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-b from-brand-900/90 via-brand-900/80 to-brand-900/70 sm:bg-gradient-to-r sm:from-brand-900/95 sm:via-brand-900/80 sm:to-brand-900/40"
          />

          <div className="relative px-6 py-16 sm:px-12 lg:max-w-2xl lg:py-24">
            <span className="badge bg-accent-400/90 text-brand-900">{t("teamsBadge")}</span>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {t("teamsTitle")}
            </h2>
            <p className="mt-4 text-lg leading-8 text-brand-100">{t("teamsSubtitle")}</p>

            <ul className="mt-8 space-y-3">
              {teamPoints.map((point) => (
                <li key={point} className="flex items-start gap-3 text-sm text-white sm:text-base">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-400 text-brand-900">
                    <CheckIcon className="h-3 w-3" />
                  </span>
                  {point}
                </li>
              ))}
            </ul>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/corporate-training"
                className="btn inline-flex bg-accent-400 text-brand-900 hover:bg-accent-300"
              >
                {t("teamsCta")}
              </Link>
              <Link
                href="/contact"
                className="btn inline-flex border border-brand-300 text-white hover:bg-brand-800"
              >
                {t("teamsCtaSecondary")}
              </Link>
            </div>
          </div>
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
