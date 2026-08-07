import { getTranslations } from "next-intl/server";
import SectionHeading from "@/components/marketing/SectionHeading";
import CTABanner from "@/components/marketing/CTABanner";

export async function generateMetadata() {
  const t = await getTranslations("about");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function AboutPage() {
  const t = await getTranslations("about");

  const values = [1, 2, 3, 4].map((i) => ({
    title: t(`value${i}t`),
    text: t(`value${i}d`),
  }));

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
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-12 md:grid-cols-2">
          <div>
            <h2 className="section-title">{t("missionTitle")}</h2>
            <p className="mt-4 leading-7 text-slate-600">{t("missionP1")}</p>
            <p className="mt-4 leading-7 text-slate-600">{t("missionP2")}</p>
          </div>
          <div>
            <h2 className="section-title">{t("storyTitle")}</h2>
            <p className="mt-4 leading-7 text-slate-600">{t("storyP1")}</p>
            <p className="mt-4 leading-7 text-slate-600">{t("storyP2")}</p>
          </div>
        </div>
      </section>

      <section className="bg-slate-50">
        <div className="container-page py-20">
          <SectionHeading title={t("valuesTitle")} subtitle={t("valuesSubtitle")} />
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((value, index) => (
              <div key={value.title} className="card">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 font-bold text-white">
                  {index + 1}
                </span>
                <h3 className="mt-4 font-semibold text-slate-900">{value.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{value.text}</p>
              </div>
            ))}
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
