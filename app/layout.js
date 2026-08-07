import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import Script from "next/script";
import "./globals.css";
import Providers from "./providers";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ChatWidget from "@/components/ChatWidget";
import SiteChrome from "@/components/SiteChrome";

const inter = Inter({ subsets: ["latin"], display: "swap" });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gotalkify.com";

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "GoTalkify — Learn English & French with Native Tutors",
    template: "%s | GoTalkify",
  },
  description:
    "One-on-one online English and French lessons with professional native tutors. Book a trial lesson, learn on your schedule, anywhere in the world.",
  openGraph: {
    siteName: "GoTalkify",
    type: "website",
    url: siteUrl,
  },
  twitter: { card: "summary_large_image" },
  icons: { icon: "/logo.avif" },
};

export default async function RootLayout({ children }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const gaId = process.env.NEXT_PUBLIC_GA_ID;

  return (
    <ConvexAuthNextjsServerProvider>
      <html lang={locale}>
        <body className={`${inter.className} flex min-h-screen flex-col`}>
          <NextIntlClientProvider messages={messages}>
            <Providers>
              <SiteChrome header={<Header />} footer={<Footer />}>
                {children}
              </SiteChrome>
              <ChatWidget />
            </Providers>
          </NextIntlClientProvider>
          {gaId ? (
            <>
              <Script
                src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
                strategy="afterInteractive"
              />
              <Script id="ga4" strategy="afterInteractive">
                {`window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${gaId}');`}
              </Script>
            </>
          ) : null}
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
