import { getTranslations } from "next-intl/server";
import LanguageLanding from "@/components/marketing/LanguageLanding";

export async function generateMetadata() {
  const t = await getTranslations("frenchLessons");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default function FrenchLessonsPage() {
  return <LanguageLanding namespace="frenchLessons" />;
}
