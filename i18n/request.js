import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export const SUPPORTED_LOCALES = ["en", "fr"];

export default getRequestConfig(async () => {
  const cookieLocale = cookies().get("locale")?.value;
  const locale = SUPPORTED_LOCALES.includes(cookieLocale) ? cookieLocale : "en";
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
