"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cleanError } from "@/components/admin/helpers";
import {
  SectionCard,
  EmptyState,
  LoadingRows,
  ErrorBanner,
} from "@/components/dashboard/ui";
import {
  BookOpen,
  Plus,
  Trash2,
  Pencil,
  TriangleAlert,
  CheckCircle2,
} from "lucide-react";

const EMPTY_ENTRY = {
  kind: "qa",
  question: "",
  answer: "",
  category: "",
  published: true,
};

const SUB_TABS = [
  { id: "knowledge", label: "Knowledge base" },
  { id: "prompt", label: "Main prompt" },
];

/* ------------------------------- knowledge base ------------------------------- */

function KnowledgeManager() {
  const entries = useQuery(api.support.listKnowledge);
  const save = useMutation(api.support.saveKnowledge);
  const remove = useMutation(api.support.deleteKnowledge);
  const seed = useMutation(api.support.seedStarterKnowledge);

  const [draft, setDraft] = useState(EMPTY_ENTRY);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function set(key) {
    return (e) => {
      const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
      setDraft((d) => ({ ...d, [key]: value }));
    };
  }

  function startNew() {
    setEditingId(null);
    setDraft(EMPTY_ENTRY);
  }

  function startEdit(entry) {
    setEditingId(entry._id);
    setDraft({
      kind: entry.kind,
      question: entry.question,
      answer: entry.answer,
      category: entry.category ?? "",
      published: entry.published,
    });
  }

  async function onSave(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await save({
        id: editingId ?? undefined,
        kind: draft.kind,
        question: draft.question,
        answer: draft.answer,
        category: draft.category || undefined,
        published: draft.published,
      });
      startNew();
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id) {
    if (!window.confirm("Delete this entry? The assistant will stop using it.")) return;
    setError("");
    try {
      await remove({ id });
      if (editingId === id) startNew();
    } catch (err) {
      setError(cleanError(err));
    }
  }

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} onDismiss={() => setError("")} />

      <SectionCard
        title={editingId ? "Edit entry" : "Add an entry"}
        action={
          editingId ? (
            <button onClick={startNew} className="btn-secondary px-3 py-1.5 text-sm">
              Cancel edit
            </button>
          ) : null
        }
      >
        <form onSubmit={onSave} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="kind">Type</label>
              <select id="kind" className="input" value={draft.kind} onChange={set("kind")}>
                <option value="qa">Question &amp; answer</option>
                <option value="content">Reference content</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="category">Category (optional)</label>
              <input
                id="category"
                className="input"
                placeholder="Booking, Payments, Tutors…"
                value={draft.category}
                onChange={set("category")}
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 pb-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={draft.published}
                  onChange={set("published")}
                />
                Used by the assistant
              </label>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="question">
              {draft.kind === "qa" ? "Question *" : "Title (optional)"}
            </label>
            <input
              id="question"
              className="input"
              required={draft.kind === "qa"}
              placeholder={
                draft.kind === "qa"
                  ? "How do I book a trial lesson?"
                  : "How the classroom works"
              }
              value={draft.question}
              onChange={set("question")}
            />
          </div>

          <div>
            <label className="label" htmlFor="answer">
              {draft.kind === "qa" ? "Answer *" : "Content *"}
            </label>
            <textarea
              id="answer"
              rows={5}
              required
              className="input"
              placeholder="Write it the way you would say it to a customer. The assistant answers only from what you write here."
              value={draft.answer}
              onChange={set("answer")}
            />
          </div>

          <button className="btn-primary gap-2" disabled={busy}>
            <Plus className="h-4 w-4" />
            {busy ? "Saving…" : editingId ? "Save changes" : "Add entry"}
          </button>
        </form>
      </SectionCard>

      <SectionCard title={`Entries${entries ? ` (${entries.length})` : ""}`}>
        {entries === undefined ? (
          <LoadingRows rows={3} />
        ) : entries.length === 0 ? (
          <div className="space-y-4">
            <EmptyState
              compact
              icon={BookOpen}
              title="The knowledge base is empty"
              message="Until you add entries the assistant cannot answer anything — it will hand every question to your team."
            />
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <p className="mb-3">
                Start from a draft covering registration, tutors, trials, booking,
                cancellations, payments and payouts —{" "}
                <span className="font-semibold text-slate-800">
                  then read every entry and correct anything that does not match your
                  current policies.
                </span>
              </p>
              <button
                onClick={async () => {
                  setError("");
                  try {
                    await seed({});
                  } catch (err) {
                    setError(cleanError(err));
                  }
                }}
                className="btn-secondary text-sm"
              >
                Load starter entries
              </button>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.map((entry) => (
              <li key={entry._id} className="flex items-start gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                    {entry.question || "(untitled content)"}
                    {entry.category ? (
                      <span className="badge-gray">{entry.category}</span>
                    ) : null}
                    {entry.published ? null : (
                      <span className="badge-yellow">Not in use</span>
                    )}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{entry.answer}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => startEdit(entry)}
                    className="btn-secondary px-2.5 py-1.5 text-xs"
                    aria-label="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onDelete(entry._id)}
                    className="rounded-xl border border-red-200 px-2.5 py-1.5 text-xs text-red-600 transition-colors hover:bg-red-50"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

/* --------------------------- main prompt & settings --------------------------- */

function PromptSettings() {
  const config = useQuery(api.support.adminConfig);
  const update = useMutation(api.support.updateConfig);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (config && !form) {
      setForm({
        systemPrompt: config.systemPrompt,
        model: config.model,
        temperature: String(config.temperature),
        welcomeMessage: config.welcomeMessage,
        enabled: config.enabled,
      });
    }
  }, [config, form]);

  if (config === undefined || !form) return <LoadingRows rows={4} />;

  function set(key) {
    return (e) => {
      const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
      setForm((f) => ({ ...f, [key]: value }));
      setSaved(false);
    };
  }

  async function onSave(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await update({
        systemPrompt: form.systemPrompt,
        model: form.model.trim(),
        temperature: Number(form.temperature),
        welcomeMessage: form.welcomeMessage,
        enabled: form.enabled,
      });
      setSaved(true);
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} onDismiss={() => setError("")} />

      {config.lastError ? (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">The assistant could not answer last time</p>
            <p className="mt-1">{config.lastError}</p>
            <p className="mt-1 text-xs opacity-75">
              Visitors saw the hand-over form instead of an answer. This clears
              itself as soon as a question is answered successfully.
            </p>
          </div>
        </div>
      ) : null}

      {config.hasApiKey ? null : (
        <div className="flex items-start gap-3 rounded-2xl border border-yellow-200 bg-yellow-50 px-5 py-4 text-sm text-yellow-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <span className="font-semibold">OPENAI_API_KEY is not set</span> on the
            Convex deployment. Until it is, the widget still works but every
            question is handed straight to your team instead of being answered.
            Set it with{" "}
            <code className="rounded bg-yellow-100 px-1">
              npx convex env set OPENAI_API_KEY sk-…
            </code>
          </p>
        </div>
      )}

      <SectionCard title="Main prompt">
        <form onSubmit={onSave} className="space-y-4">
          <div>
            <label className="label" htmlFor="systemPrompt">
              System prompt — how the assistant behaves
            </label>
            <textarea
              id="systemPrompt"
              rows={18}
              className="input font-mono text-xs leading-relaxed"
              value={form.systemPrompt}
              onChange={set("systemPrompt")}
            />
            <p className="mt-1 text-xs text-slate-400">
              The knowledge base is appended automatically after this prompt. Keep the
              instruction to reply as JSON with an <code>escalate</code> flag — the
              hand-over to your team depends on it.
            </p>
            <button
              type="button"
              onClick={() => {
                setForm((f) => ({ ...f, systemPrompt: config.defaultSystemPrompt }));
                setSaved(false);
              }}
              className="mt-2 text-xs font-semibold text-brand-600 hover:underline"
            >
              Restore the recommended prompt
            </button>
          </div>

          <div>
            <label className="label" htmlFor="welcomeMessage">
              Welcome message (first thing a visitor sees)
            </label>
            <textarea
              id="welcomeMessage"
              rows={2}
              className="input"
              value={form.welcomeMessage}
              onChange={set("welcomeMessage")}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="model">OpenAI model</label>
              <input id="model" className="input" value={form.model} onChange={set("model")} />
              <p className="mt-1 text-xs text-slate-400">e.g. gpt-4o-mini, gpt-4o</p>
            </div>
            <div>
              <label className="label" htmlFor="temperature">Temperature</label>
              <input
                id="temperature"
                type="number"
                min="0"
                max="2"
                step="0.1"
                className="input"
                value={form.temperature}
                onChange={set("temperature")}
              />
              <p className="mt-1 text-xs text-slate-400">Lower = more factual.</p>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 pb-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={form.enabled}
                  onChange={set("enabled")}
                />
                Show the widget on the site
              </label>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button className="btn-primary" disabled={busy}>
              {busy ? "Saving…" : "Save settings"}
            </button>
            {saved ? (
              <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                <CheckCircle2 className="h-4 w-4" /> Saved
              </span>
            ) : null}
          </div>
        </form>
      </SectionCard>
    </div>
  );
}

/* ---------------------------------- section ---------------------------------- */

/**
 * The AI assistant's brain, as an admin settings section: what it is allowed
 * to say (knowledge base) and how it behaves (main prompt). The conversations
 * it produces live on the AI Support page instead.
 */
export default function AiSupportSettings() {
  const [tab, setTab] = useState("knowledge");
  return (
    <div className="space-y-6">
      <div className="flex gap-1.5 overflow-x-auto">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
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
      {tab === "knowledge" ? <KnowledgeManager /> : <PromptSettings />}
    </div>
  );
}
