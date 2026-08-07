"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Modal from "@/components/Modal";
import {
  PageHeader,
  SectionCard,
  EmptyState,
  LoadingRows,
  ErrorBanner,
} from "@/components/dashboard/ui";
import { HelpCircle, Plus, Pencil, Trash2, CheckCircle2, Import } from "lucide-react";
import enMessages from "@/messages/en.json";
import frMessages from "@/messages/fr.json";

const MESSAGES = { en: enMessages, fr: frMessages };

function cleanError(error) {
  return String(error?.message ?? error ?? "")
    .replace(/^.*Uncaught Error:\s*/, "")
    .split("\n")[0] || "Something went wrong.";
}

function LocaleToggle({ locale, onChange }) {
  return (
    <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
      {[["en", "English"], ["fr", "Français"]].map(([value, label]) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
            locale === value ? "bg-white text-brand-700 shadow-sm" : "text-slate-500"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------- FAQs --------------------------------- */

function builtInFaqs(locale) {
  const t = MESSAGES[locale].faqs;
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    .filter((i) => t[`q${i}`])
    .map((i, idx) => ({
      question: t[`q${i}`],
      answer: t[`a${i}`],
      order: idx + 1,
      published: true,
    }));
}

function FaqsManager({ locale }) {
  const faqs = useQuery(api.content.adminListFaqs, { locale });
  const saveFaq = useMutation(api.content.saveFaq);
  const deleteFaq = useMutation(api.content.deleteFaq);

  const [editing, setEditing] = useState(null); // null | {id?, question, answer, order, published}
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSave() {
    setBusy(true);
    setError(null);
    try {
      await saveFaq({
        id: editing.id,
        locale,
        question: editing.question,
        answer: editing.answer,
        order: Number(editing.order) || 0,
        published: editing.published,
      });
      setEditing(null);
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusy(false);
    }
  }

  async function importBuiltIns() {
    setBusy(true);
    setError(null);
    try {
      for (const faq of builtInFaqs(locale)) {
        await saveFaq({ locale, ...faq });
      }
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusy(false);
    }
  }

  const newFaq = () =>
    setEditing({
      question: "",
      answer: "",
      order: (faqs?.length ?? 0) + 1,
      published: true,
    });

  return (
    <SectionCard
      title={`FAQs (${locale === "en" ? "English" : "Français"})`}
      action={
        <button onClick={newFaq} className="btn-primary gap-1.5 px-4 py-2 text-sm">
          <Plus className="h-4 w-4" /> Add FAQ
        </button>
      }
    >
      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      {faqs === undefined ? (
        <LoadingRows rows={4} />
      ) : faqs.length === 0 ? (
        <div>
          <EmptyState
            compact
            icon={HelpCircle}
            title="No custom FAQs yet"
            message="The site currently shows the built-in FAQs. Import them below to start editing, or add new ones from scratch."
          />
          <div className="flex justify-center pb-4">
            <button
              onClick={importBuiltIns}
              disabled={busy}
              className="btn-secondary gap-1.5 px-4 py-2 text-sm"
            >
              <Import className="h-4 w-4" />
              {busy ? "Importing…" : "Import current site FAQs"}
            </button>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {faqs.map((faq) => (
            <li
              key={faq._id}
              className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-800">
                  <span className="badge-gray">#{faq.order}</span>
                  {faq.question}
                  {faq.published ? (
                    <span className="badge-green">Published</span>
                  ) : (
                    <span className="badge-yellow">Draft</span>
                  )}
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-slate-500">{faq.answer}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    setEditing({
                      id: faq._id,
                      question: faq.question,
                      answer: faq.answer,
                      order: faq.order,
                      published: faq.published,
                    })
                  }
                  className="btn-secondary gap-1.5 px-4 py-2 text-sm"
                >
                  <Pencil className="h-4 w-4" /> Edit
                </button>
                <button
                  onClick={() => {
                    if (window.confirm("Delete this FAQ?")) {
                      deleteFaq({ id: faq._id }).catch((err) => setError(cleanError(err)));
                    }
                  }}
                  className="btn-danger gap-1.5 px-4 py-2 text-sm"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit FAQ" : "Add FAQ"}
        wide
      >
        {editing ? (
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="faq-q">Question</label>
              <input
                id="faq-q"
                className="input"
                value={editing.question}
                onChange={(e) => setEditing({ ...editing, question: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="faq-a">Answer</label>
              <textarea
                id="faq-a"
                rows={5}
                className="input"
                value={editing.answer}
                onChange={(e) => setEditing({ ...editing, answer: e.target.value })}
              />
            </div>
            <div className="flex flex-wrap items-center gap-5">
              <div>
                <label className="label" htmlFor="faq-order">Order</label>
                <input
                  id="faq-order"
                  type="number"
                  className="input max-w-[7rem]"
                  value={editing.order}
                  onChange={(e) => setEditing({ ...editing, order: e.target.value })}
                />
              </div>
              <label className="mt-5 flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={editing.published}
                  onChange={(e) => setEditing({ ...editing, published: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600"
                />
                Published
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary" disabled={busy} onClick={onSave}>
                {busy ? "Saving…" : "Save FAQ"}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </SectionCard>
  );
}

/* ------------------------- Privacy / Terms editor ------------------------ */

function builtInPage(slug, locale) {
  const t = MESSAGES[locale][slug];
  const count = slug === "terms" ? 10 : 9;
  const sections = [];
  for (let i = 1; i <= count; i++) {
    if (t[`s${i}t`]) sections.push(`## ${t[`s${i}t`]}\n\n${t[`s${i}p`]}`);
  }
  return {
    title: t.title,
    subtitle: t.updated ?? "",
    content: [t.intro, ...sections].filter(Boolean).join("\n\n"),
  };
}

function PageEditor({ slug, locale, label }) {
  const page = useQuery(api.content.getPage, { slug, locale });
  const savePage = useMutation(api.content.savePage);

  const [form, setForm] = useState(null); // {title, subtitle, content}
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  // Load the stored page (or built-in default) into the editor whenever
  // the slug/locale target changes.
  useEffect(() => {
    if (page === undefined) return;
    setSaved(false);
    setError(null);
    setForm(
      page
        ? { title: page.title, subtitle: page.subtitle ?? "", content: page.content }
        : builtInPage(slug, locale)
    );
  }, [page, slug, locale]);

  async function onSave() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await savePage({
        slug,
        locale,
        title: form.title,
        subtitle: form.subtitle || undefined,
        content: form.content,
      });
      setSaved(true);
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard
      title={`${label} (${locale === "en" ? "English" : "Français"})`}
      action={
        page === null ? (
          <span className="badge-yellow">Using built-in content</span>
        ) : page ? (
          <span className="badge-green">Customized</span>
        ) : null
      }
    >
      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      {form === null ? (
        <LoadingRows rows={3} />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={`${slug}-title`}>Page title</label>
              <input
                id={`${slug}-title`}
                className="input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor={`${slug}-subtitle`}>
                Subtitle (e.g. &quot;Last updated: July 2026&quot;)
              </label>
              <input
                id={`${slug}-subtitle`}
                className="input"
                value={form.subtitle}
                onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor={`${slug}-content`}>Content</label>
            <textarea
              id={`${slug}-content`}
              rows={18}
              className="input font-mono text-sm"
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
            />
            <p className="mt-1.5 text-xs text-slate-400">
              Start a line with <code className="rounded bg-slate-100 px-1">## </code> for a
              section heading. Separate paragraphs with a blank line.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button className="btn-primary" disabled={busy} onClick={onSave}>
              {busy ? "Saving…" : "Save & publish"}
            </button>
            {saved ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600">
                <CheckCircle2 className="h-4 w-4" /> Saved — live on the site.
              </span>
            ) : null}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

/* --------------------------------- Page ---------------------------------- */

const TABS = [
  { id: "faqs", label: "FAQs" },
  { id: "privacy", label: "Privacy Policy" },
  { id: "terms", label: "Terms & Conditions" },
];

export default function AdminContentPage() {
  const me = useQuery(api.users.me);
  const [tab, setTab] = useState("faqs");
  const [locale, setLocale] = useState("en");

  if (me === undefined) {
    return (
      <div className="card">
        <LoadingRows rows={3} />
      </div>
    );
  }
  if (!me || me.role !== "admin") {
    return (
      <div className="card">
        <EmptyState title="Admins only" message="You don't have access to this page." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Site content"
        description="Edit the FAQs, Privacy Policy and Terms & Conditions shown on the public site."
      >
        <LocaleToggle locale={locale} onChange={setLocale} />
      </PageHeader>

      <div className="flex gap-1.5 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
              tab === t.id
                ? "bg-brand-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:text-brand-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "faqs" ? <FaqsManager key={locale} locale={locale} /> : null}
      {tab === "privacy" ? (
        <PageEditor key={`privacy-${locale}`} slug="privacy" locale={locale} label="Privacy Policy" />
      ) : null}
      {tab === "terms" ? (
        <PageEditor key={`terms-${locale}`} slug="terms" locale={locale} label="Terms & Conditions" />
      ) : null}
    </div>
  );
}
