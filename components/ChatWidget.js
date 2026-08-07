"use client";

import { useEffect } from "react";

/** Crisp chat widget (swappable). Renders nothing without a website id. */
export default function ChatWidget() {
  useEffect(() => {
    const websiteId = process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID;
    if (!websiteId || window.$crisp) return;
    window.$crisp = [];
    window.CRISP_WEBSITE_ID = websiteId;
    const script = document.createElement("script");
    script.src = "https://client.crisp.chat/l.js";
    script.async = true;
    document.head.appendChild(script);
  }, []);
  return null;
}
