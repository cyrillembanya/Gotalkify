import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import FaqAccordion from "@/components/marketing/FaqAccordion";

async function getEditedFaqs() {
  try {
    const locale = await getLocale();
    return await fetchQuery(api.content.listFaqs, {
      locale: locale === "fr" ? "fr" : "en",
    });
  } catch {
    return null; // Convex unreachable — fall back to built-in content
  }
}

export async function generateMetadata() {
  const t = await getTranslations("faqs");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function FaqsPage() {
  const t = await getTranslations("faqs");
  const edited = await getEditedFaqs();

  // Admin-managed FAQs win once at least one is published; otherwise built-ins.
  const items =
    edited && edited.length > 0
      ? edited.map((f) => ({ q: f.question, a: f.answer }))
      : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => ({
          q: t(`q${i}`),
          a: t(`a${i}`),
        }));

  return (
    <>
      <section className="bg-gradient-to-b from-slate-100 to-slate-50">
        <div className="container-page py-16 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">{t("subtitle")}</p>
        </div>
      </section>

      <section className="container-page pb-20">
        <div className="mx-auto max-w-3xl">
          <FaqAccordion items={items} />

          <div className="mt-12 rounded-2xl border border-brand-100 bg-brand-50 px-6 py-10 text-center">
            <h2 className="text-xl font-bold text-slate-900">{t("moreTitle")}</h2>
            <p className="mt-2 text-slate-600">{t("moreText")}</p>
            <Link href="/contact" className="btn-primary mt-6">
              {t("moreButton")}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
