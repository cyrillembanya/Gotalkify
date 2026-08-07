import Link from "next/link";
import { getTranslations } from "next-intl/server";
import SectionHeading from "@/components/marketing/SectionHeading";

export async function generateMetadata() {
  const t = await getTranslations("corporate");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function CorporateTrainingPage() {
  const t = await getTranslations("corporate");

  const benefits = [1, 2, 3, 4].map((i) => ({
    title: t(`benefit${i}t`),
    text: t(`benefit${i}d`),
  }));
  const steps = [1, 2, 3].map((i) => ({
    title: t(`how${i}t`),
    text: t(`how${i}d`),
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
            <Link
              href="/contact?program=corporate"
              className="btn-primary px-8 py-3 text-base"
            >
              {t("heroCta")}
            </Link>
          </div>
        </div>
      </section>

      <section className="container-page py-20">
        <SectionHeading title={t("benefitsTitle")} subtitle={t("benefitsSubtitle")} />
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {benefits.map((benefit) => (
            <div key={benefit.title} className="card">
              <h3 className="font-semibold text-slate-900">{benefit.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{benefit.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-slate-50">
        <div className="container-page py-20">
          <SectionHeading title={t("howTitle")} />
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
        </div>
      </section>

      {/* Inquiry CTA */}
      <section className="container-page py-16">
        <div className="mx-auto max-w-3xl rounded-2xl border border-brand-100 bg-brand-50 px-6 py-12 text-center sm:px-12">
          <h2 className="section-title">{t("inquiryTitle")}</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-600">{t("inquiryText")}</p>
          <Link href="/contact?program=corporate" className="btn-primary mt-8">
            {t("inquiryButton")}
          </Link>
        </div>
      </section>
    </>
  );
}
