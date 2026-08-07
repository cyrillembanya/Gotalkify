"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAction } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import Turnstile from "@/components/Turnstile";

const PROGRAMS = ["general", "english", "french", "corporate"];

/** Contact/inquiry form. Preselects program from ?program= query param. */
export default function ContactForm() {
  const t = useTranslations("contact");
  const searchParams = useSearchParams();
  const submitInquiry = useAction(api.marketing.submitInquiry);

  const paramProgram = searchParams.get("program");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [program, setProgram] = useState(
    PROGRAMS.includes(paramProgram) ? paramProgram : "general"
  );
  const [message, setMessage] = useState("");
  const [token, setToken] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | sending | success | error

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("sending");
    try {
      await submitInquiry({
        name,
        email,
        message,
        program,
        turnstileToken: token ?? undefined,
      });
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="card text-center">
        <span
          aria-hidden="true"
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100"
        >
          <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </span>
        <h2 className="text-lg font-semibold text-slate-900">{t("successTitle")}</h2>
        <p className="mt-2 text-sm text-slate-600">{t("successText")}</p>
        <button
          type="button"
          className="btn-secondary mt-6"
          onClick={() => {
            setName("");
            setEmail("");
            setMessage("");
            setStatus("idle");
          }}
        >
          {t("sendAnother")}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="contact-name" className="label">
            {t("nameLabel")}
          </label>
          <input
            id="contact-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
            className="input"
          />
        </div>
        <div>
          <label htmlFor="contact-email" className="label">
            {t("emailLabel")}
          </label>
          <input
            id="contact-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("emailPlaceholder")}
            className="input"
          />
        </div>
      </div>

      <div>
        <label htmlFor="contact-program" className="label">
          {t("programLabel")}
        </label>
        <select
          id="contact-program"
          value={program}
          onChange={(e) => setProgram(e.target.value)}
          className="input"
        >
          <option value="general">{t("programGeneral")}</option>
          <option value="english">{t("programEnglish")}</option>
          <option value="french">{t("programFrench")}</option>
          <option value="corporate">{t("programCorporate")}</option>
        </select>
      </div>

      <div>
        <label htmlFor="contact-message" className="label">
          {t("messageLabel")}
        </label>
        <textarea
          id="contact-message"
          required
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("messagePlaceholder")}
          className="input resize-y"
        />
      </div>

      <Turnstile onToken={setToken} />

      {status === "error" ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {t("errorText")}
        </p>
      ) : null}

      <button type="submit" disabled={status === "sending"} className="btn-primary w-full sm:w-auto">
        {status === "sending" ? t("sending") : t("submit")}
      </button>
    </form>
  );
}
