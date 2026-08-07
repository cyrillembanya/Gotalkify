"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function NewsletterForm() {
  const t = useTranslations("footer");
  const locale = useLocale();
  const subscribe = useMutation(api.marketing.subscribeNewsletter);
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle"); // idle | loading | done | error

  async function onSubmit(e) {
    e.preventDefault();
    setState("loading");
    try {
      await subscribe({ email, locale });
      setState("done");
      setEmail("");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return <p className="text-sm font-medium text-brand-200">{t("newsletterThanks")}</p>;
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm gap-2">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t("newsletterPlaceholder")}
        className="input flex-1 border-slate-600 bg-slate-800 text-white placeholder-slate-400"
      />
      <button className="btn-accent shrink-0" disabled={state === "loading"}>
        {t("newsletterButton")}
      </button>
      {state === "error" ? (
        <p className="text-xs text-red-300">{t("newsletterError")}</p>
      ) : null}
    </form>
  );
}
