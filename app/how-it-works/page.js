import Link from "next/link";
import { getTranslations } from "next-intl/server";
import SectionHeading from "@/components/marketing/SectionHeading";
import CTABanner from "@/components/marketing/CTABanner";

export async function generateMetadata() {
  const t = await getTranslations("howItWorks");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function HowItWorksPage() {
  const t = await getTranslations("howItWorks");

  const steps = [1, 2, 3, 4].map((i) => ({
    title: t(`step${i}t`),
    text: t(`step${i}d`),
  }));
  const faqs = [1, 2, 3].map((i) => ({ q: t(`q${i}`), a: t(`a${i}`) }));

  return (
    <>
      <section className="bg-gradient-to-b from-slate-100 to-slate-50">
        <div className="container-page py-20 text-center">
          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            {t("heroTitle")}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
            {t("heroSubtitle")}
          </p>
        </div>
      </section>

      <section className="container-page py-16">
        <ol className="mx-auto max-w-3xl space-y-10">
          {steps.map((step, index) => (
            <li key={step.title} className="relative flex gap-6">
              <div className="flex flex-col items-center">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white">
                  {index + 1}
                </span>
                {index < steps.length - 1 ? (
                  <span aria-hidden="true" className="mt-2 w-px flex-1 bg-brand-100" />
                ) : null}
              </div>
              <div className="pb-2">
                <h2 className="text-xl font-bold text-slate-900">{step.title}</h2>
                <p className="mt-2 leading-7 text-slate-600">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-slate-50">
        <div className="container-page py-20">
          <SectionHeading title={t("faqTitle")} subtitle={t("faqSubtitle")} />
          <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
            {faqs.map((faq) => (
              <div key={faq.q} className="card">
                <h3 className="font-semibold text-slate-900">{faq.q}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{faq.a}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link href="/faqs" className="font-medium text-brand-600 hover:text-brand-700">
              {t("faqLink")} →
            </Link>
          </div>
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
