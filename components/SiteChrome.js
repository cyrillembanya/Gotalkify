"use client";

import { usePathname } from "next/navigation";

// Hides the marketing header/footer on dashboard and classroom routes, which
// bring their own chrome (the classroom is full-bleed).
export default function SiteChrome({ header, footer, children }) {
  const pathname = usePathname();
  const isClass = pathname.startsWith("/class");
  const bare = pathname.startsWith("/dashboard") || isClass;

  return (
    <>
      {bare ? null : header}
      {/* The classroom sizes itself to the viewport and scrolls internally,
          so it must not be allowed to stretch the page. */}
      <main className={isClass ? "min-h-0 flex-1 overflow-hidden" : "flex-1"}>
        {children}
      </main>
      {bare ? null : footer}
    </>
  );
}
