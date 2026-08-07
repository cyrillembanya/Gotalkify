"use client";

import { usePathname } from "next/navigation";

// Hides the marketing header/footer on dashboard routes, which bring their own chrome.
export default function SiteChrome({ header, footer, children }) {
  const pathname = usePathname();
  const isDashboard = pathname.startsWith("/dashboard");

  return (
    <>
      {isDashboard ? null : header}
      <main className="flex-1">{children}</main>
      {isDashboard ? null : footer}
    </>
  );
}
