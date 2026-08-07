import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import ContactForm from "@/components/marketing/ContactForm";

export async function generateMetadata() {
  const t = await getTranslations("contact");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function ContactPage() {
  const t = await getTranslations("contact");

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
        <div className="mx-auto max-w-2xl">
          <Suspense fallback={<div className="card h-96 animate-pulse bg-slate-50" />}>
            <ContactForm />
          </Suspense>
        </div>
      </section>
    </>
  );
}
