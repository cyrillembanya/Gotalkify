import { getTranslations } from "next-intl/server";
import LanguageLanding from "@/components/marketing/LanguageLanding";

export async function generateMetadata() {
  const t = await getTranslations("englishLessons");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default function EnglishLessonsPage() {
  return <LanguageLanding namespace="englishLessons" />;
}
