"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cleanError } from "@/components/admin/helpers";
import {
  SectionCard,
  EmptyState,
  LoadingRows,
  ErrorBanner,
} from "@/components/dashboard/ui";
import { ListFilter, Pencil, Plus, RotateCcw, Trash2, Wand2, X } from "lucide-react";

const BLANK = {
  id: null,
  category: "profanity",
  kind: "keyword",
  pattern: "",
  label: "",
  severity: "block_message",
  enabled: true,
  notes: "",
};

const SEVERITY_BADGE = {
  flag: "badge-yellow",
  block_message: "badge-blue",
  block_chat: "badge-red",
};

/** The keyword / pattern list the chat filter runs on. */
export default function ModerationKeywords() {
  const data = useQuery(api.moderation.catalogue, {});
  const saveRule = useMutation(api.moderation.saveRule);
  const setEnabled = useMutation(api.moderation.setRuleEnabled);
  const deleteRule = useMutation(api.moderation.deleteRule);
  const restoreDefaults = useMutation(api.moderation.restoreDefaults);

  const [draft, setDraft] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const rules = useMemo(() => data?.rules ?? [], [data]);
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rules.filter(
      (rule) =>
        (filter === "all" || rule.category === filter) &&
        (!needle ||
          rule.label.toLowerCase().includes(needle) ||
          rule.pattern.toLowerCase().includes(needle))
    );
  }, [rules, filter, search]);

  async function run(action, successMessage) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await action();
      if (successMessage) setNotice(successMessage(result));
      return true;
    } catch (err) {
      setError(cleanError(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onSave(event) {
    event.preventDefault();
    const ok = await run(() =>
      saveRule({
        id: draft.id ?? undefined,
        category: draft.category,
        kind: draft.kind,
        pattern: draft.pattern,
        label: draft.label.trim() || draft.pattern.trim(),
        severity: draft.severity,
        enabled: draft.enabled,
        notes: draft.notes,
      })
    );
    if (ok) setDraft(null);
  }

  if (data === undefined) return <LoadingRows rows={5} />;

  const counts = rules.reduce((acc, rule) => {
    acc[rule.category] = (acc[rule.category] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {!data.seeded ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">The built-in keyword list is not saved yet.</p>
          <p className="mt-1">
            Chats are already being filtered with the {data.defaultCount} built-in rules.
            Save them to the database to edit, disable or add to them.
          </p>
          <button
            type="button"
            className="btn-primary mt-3"
            disabled={busy}
            onClick={() =>
              run(
                () => restoreDefaults({}),
                (result) => `Saved ${result.added} keywords.`
              )
            }
          >
            {busy ? "Saving…" : "Save the built-in keywords"}
          </button>
        </div>
      ) : null}

      <SectionCard
        title={`Keywords and patterns (${rules.length})`}
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary gap-1.5"
              disabled={busy}
              onClick={() =>
                run(
                  () => restoreDefaults({}),
                  (result) =>
                    result.added
                      ? `Restored ${result.added} built-in keywords.`
                      : "Every built-in keyword is already on the list."
                )
              }
            >
              <RotateCcw className="h-4 w-4" />
              Restore defaults
            </button>
            <button
              type="button"
              className="btn-primary gap-1.5"
              onClick={() => setDraft({ ...BLANK })}
            >
              <Plus className="h-4 w-4" />
              Add a rule
            </button>
          </div>
        }
      >
        <ErrorBanner message={error} onDismiss={() => setError("")} />
        {notice ? (
          <p className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {notice}
          </p>
        ) : null}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <ListFilter className="h-4 w-4 text-slate-400" />
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              filter === "all" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            All ({rules.length})
          </button>
          {Object.entries(data.categories).map(([key, meta]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              title={meta.description}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                filter === key ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {meta.label} ({counts[key] ?? 0})
            </button>
          ))}
          <input
            className="input ml-auto w-full max-w-[14rem]"
            placeholder="Search keywords…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {visible.length === 0 ? (
          <EmptyState
            compact
            icon={ListFilter}
            title="Nothing here"
            message={
              rules.length === 0
                ? "Save the built-in keywords above, or add your own rule."
                : "No rule matches that filter."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Category</th>
                  <th>Action</th>
                  <th>On</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((rule) => (
                  <tr key={rule._id} className={rule.enabled ? "" : "opacity-50"}>
                    <td data-primary>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800">{rule.label}</p>
                        <p className="max-w-[22rem] truncate font-mono text-xs text-slate-500">
                          {rule.kind === "regex" ? "/" : ""}
                          {rule.pattern}
                          {rule.kind === "regex" ? "/gi" : ""}
                        </p>
                      </div>
                    </td>
                    <td data-label="Category">
                      {data.categories[rule.category]?.label ?? rule.category}
                    </td>
                    <td data-label="Action">
                      <span className={SEVERITY_BADGE[rule.severity] ?? "badge-gray"}>
                        {data.severities[rule.severity]?.label ?? rule.severity}
                      </span>
                    </td>
                    <td data-label="On">
                      <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          disabled={busy}
                          onChange={(event) =>
                            run(() =>
                              setEnabled({ id: rule._id, enabled: event.target.checked })
                            )
                          }
                        />
                        {rule.enabled ? "Active" : "Off"}
                      </label>
                    </td>
                    <td data-actions>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          aria-label={`Edit ${rule.label}`}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-600"
                          onClick={() =>
                            setDraft({
                              id: rule._id,
                              category: rule.category,
                              kind: rule.kind,
                              pattern: rule.pattern,
                              label: rule.label,
                              severity: rule.severity,
                              enabled: rule.enabled,
                              notes: rule.notes ?? "",
                            })
                          }
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${rule.label}`}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                          disabled={busy}
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Delete "${rule.label}"? Chats will no longer be filtered for it.`
                              )
                            ) {
                              return;
                            }
                            run(() => deleteRule({ id: rule._id }));
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <RuleTester />

      {draft ? (
        <RuleDialog
          draft={draft}
          setDraft={setDraft}
          categories={data.categories}
          severities={data.severities}
          busy={busy}
          onSave={onSave}
          onClose={() => setDraft(null)}
        />
      ) : null}
    </div>
  );
}

/** Try a message against the live rules without sending anything. */
function RuleTester() {
  const [text, setText] = useState("");
  const result = useQuery(api.moderation.testMessage, text.trim() ? { text } : "skip");

  return (
    <SectionCard title="Try a message">
      <p className="mb-4 -mt-3 text-sm text-slate-500">
        Type anything to see what the filter would do with it. Nothing is sent or recorded.
      </p>
      <label className="label" htmlFor="moderation-test">
        Sample message
      </label>
      <textarea
        id="moderation-test"
        className="input min-h-[5rem]"
        placeholder="e.g. call me on 555 123 4567"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {!text.trim() ? null : result === undefined ? (
        <p className="mt-3 text-sm text-slate-500">Checking…</p>
      ) : result.hits.length === 0 ? (
        <p className="mt-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          Clean — this message would be delivered.
        </p>
      ) : (
        <div
          className={`mt-3 rounded-xl border px-4 py-3 text-sm ${
            result.wouldBlockChat
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          <p className="flex items-center gap-2 font-semibold">
            <Wand2 className="h-4 w-4" />
            {result.wouldBlockChat
              ? "The message would be refused and the whole chat closed."
              : result.wouldBlockMessage
                ? "The message would be refused."
                : "The message would be delivered, but flagged for review."}
          </p>
          <ul className="mt-2 space-y-1">
            {result.hits.map((hit, index) => (
              <li key={`${hit.label}-${index}`}>
                <span className="font-medium">{hit.label}</span> matched{" "}
                <span className="font-mono">&ldquo;{hit.match}&rdquo;</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}

function RuleDialog({ draft, setDraft, categories, severities, busy, onSave, onClose }) {
  const set = (patch) => setDraft({ ...draft, ...patch });
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
      <form
        onSubmit={onSave}
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">
            {draft.id ? "Edit rule" : "Add a rule"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="rule-kind">
              Match as
            </label>
            <select
              id="rule-kind"
              className="input"
              value={draft.kind}
              onChange={(event) => set({ kind: event.target.value })}
            >
              <option value="keyword">
                Keyword — catches spacing, repeats and leetspeak
              </option>
              <option value="regex">Regular expression — advanced</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">
              {draft.kind === "keyword"
                ? 'A keyword also matches "s.e.x", "f u c k" and "sh1t", but never inside another word.'
                : "A JavaScript pattern, matched case-insensitively against the message as typed."}
            </p>
          </div>

          <div>
            <label className="label" htmlFor="rule-pattern">
              {draft.kind === "keyword" ? "Keyword or phrase" : "Pattern"}
            </label>
            <input
              id="rule-pattern"
              className="input font-mono"
              value={draft.pattern}
              onChange={(event) => set({ pattern: event.target.value })}
              placeholder={draft.kind === "keyword" ? "e.g. sugar daddy" : "\\b\\d{10}\\b"}
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="rule-label">
              Name (optional)
            </label>
            <input
              id="rule-label"
              className="input"
              value={draft.label}
              onChange={(event) => set({ label: event.target.value })}
              placeholder="Shown in the flag list; defaults to the keyword"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="rule-category">
                Category
              </label>
              <select
                id="rule-category"
                className="input"
                value={draft.category}
                onChange={(event) => set({ category: event.target.value })}
              >
                {Object.entries(categories).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="rule-severity">
                What happens
              </label>
              <select
                id="rule-severity"
                className="input"
                value={draft.severity}
                onChange={(event) => set({ severity: event.target.value })}
              >
                {Object.entries(severities).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="-mt-2 text-xs text-slate-500">
            {severities[draft.severity]?.description}
          </p>

          <div>
            <label className="label" htmlFor="rule-notes">
              Notes (optional)
            </label>
            <input
              id="rule-notes"
              className="input"
              value={draft.notes}
              onChange={(event) => set({ notes: event.target.value })}
              placeholder="Why this rule exists"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) => set({ enabled: event.target.checked })}
            />
            Active
          </label>
        </div>

        <div className="mt-6 flex gap-2">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save rule"}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
