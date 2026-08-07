import { getTranslations, getLocale } from "next-intl/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import RichText from "@/components/marketing/RichText";

async function getEditedPage(slug) {
  try {
    const locale = await getLocale();
    return await fetchQuery(api.content.getPage, {
      slug,
      locale: locale === "fr" ? "fr" : "en",
    });
  } catch {
    return null; // Convex unreachable — fall back to built-in content
  }
}

export async function generateMetadata() {
  const t = await getTranslations("terms");
  const page = await getEditedPage("terms");
  return {
    title: page?.title ?? t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function TermsPage() {
  const t = await getTranslations("terms");
  const page = await getEditedPage("terms");

  if (page) {
    return (
      <section className="container-page py-16">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            {page.title}
          </h1>
          {page.subtitle ? (
            <p className="mt-2 text-sm text-slate-500">{page.subtitle}</p>
          ) : null}
          <RichText content={page.content} />
        </div>
      </section>
    );
  }

  const sections = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => ({
    title: t(`s${i}t`),
    text: t(`s${i}p`),
  }));

  return (
    <section className="container-page py-16">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          {t("title")}
        </h1>
        <p className="mt-2 text-sm text-slate-500">{t("updated")}</p>
        <p className="mt-6 leading-7 text-slate-600">{t("intro")}</p>
        {sections.map((section) => (
          <div key={section.title} className="mt-8">
            <h2 className="text-xl font-bold text-slate-900">{section.title}</h2>
            <p className="mt-3 leading-7 text-slate-600">{section.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
