"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Crisp chat widget (swappable). Renders nothing without a website id. */
export default function ChatWidget() {
  const pathname = usePathname();
  // The classroom is full-bleed — a floating bubble would sit on the controls.
  const hidden = pathname.startsWith("/class");

  useEffect(() => {
    const websiteId = process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID;
    if (!websiteId) return;
    if (window.$crisp) {
      window.$crisp.push(["do", hidden ? "chat:hide" : "chat:show"]);
      return;
    }
    if (hidden) return; // don't even load it inside a class
    window.$crisp = [];
    window.CRISP_WEBSITE_ID = websiteId;
    const script = document.createElement("script");
    script.src = "https://client.crisp.chat/l.js";
    script.async = true;
    document.head.appendChild(script);
  }, [hidden]);
  return null;
}
