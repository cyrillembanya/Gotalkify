import Link from "next/link";
import { getTranslations } from "next-intl/server";
import SectionHeading from "@/components/marketing/SectionHeading";
import CTABanner from "@/components/marketing/CTABanner";

const USE_CASE_ICONS = ["💬", "💼", "📝", "🧒"];

/**
 * Shared SEO landing layout for /english-lessons and /french-lessons.
 * Server component: pulls all copy from the given namespace
 * ("englishLessons" | "frenchLessons").
 */
export default async function LanguageLanding({ namespace }) {
  const t = await getTranslations(namespace);

  const benefits = [1, 2, 3, 4].map((i) => ({
    title: t(`benefit${i}t`),
    text: t(`benefit${i}d`),
  }));
  const useCases = [1, 2, 3, 4].map((i) => ({
    title: t(`use${i}t`),
    text: t(`use${i}d`),
    icon: USE_CASE_ICONS[i - 1],
  }));

  return (
    <>
      <section className="bg-gradient-to-b from-slate-100 to-slate-50">
        <div className="container-page py-20 text-center sm:py-24">
          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            {t("heroTitle")}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
            {t("heroSubtitle")}
          </p>
          <div className="mt-10">
            <Link href="/tutors" className="btn-primary px-8 py-3 text-base">
              {t("heroCta")}
            </Link>
          </div>
        </div>
      </section>

      <section className="container-page py-20">
        <SectionHeading title={t("benefitsTitle")} subtitle={t("benefitsSubtitle")} />
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map((benefit) => (
            <div key={benefit.title} className="card">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100">
                <svg
                  aria-hidden="true"
                  className="h-5 w-5 text-brand-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </span>
              <h3 className="mt-4 font-semibold text-slate-900">{benefit.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{benefit.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-slate-50">
        <div className="container-page py-20">
          <SectionHeading title={t("useCasesTitle")} subtitle={t("useCasesSubtitle")} />
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {useCases.map((useCase) => (
              <div key={useCase.title} className="card flex gap-4">
                <span aria-hidden="true" className="text-2xl">
                  {useCase.icon}
                </span>
                <div>
                  <h3 className="font-semibold text-slate-900">{useCase.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{useCase.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="section-title">{t("pricingTitle")}</h2>
          <p className="mt-4 leading-7 text-slate-600">{t("pricingP1")}</p>
          <p className="mt-4 leading-7 text-slate-600">{t("pricingP2")}</p>
          <Link href="/tutors" className="btn-secondary mt-8">
            {t("pricingCta")}
          </Link>
        </div>
      </section>

      <CTABanner
        title={t("ctaTitle")}
        subtitle={t("ctaSubtitle")}
        buttonLabel={t("ctaButton")}
        href="/tutors"
      />
    </>
  );
}
