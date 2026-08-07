import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("pricingPage");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function PricingPage() {
  const t = await getTranslations("pricingPage");

  return (
    <section className="bg-gradient-to-b from-slate-100 to-slate-50">
      <div className="container-page flex min-h-[60vh] items-center justify-center py-20">
        <div className="card max-w-xl px-8 py-12 text-center sm:px-12">
          <span className="badge-blue">{t("badge")}</span>
          <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            {t("title")}
          </h1>
          <p className="mt-6 leading-7 text-slate-600">{t("p1")}</p>
          <p className="mt-4 leading-7 text-slate-600">{t("p2")}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/tutors" className="btn-primary">
              {t("cta")}
            </Link>
            <Link href="/how-it-works" className="btn-secondary">
              {t("secondaryCta")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
