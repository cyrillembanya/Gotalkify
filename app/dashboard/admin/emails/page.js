"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { fmtDateTime } from "@/lib/format";
import { cleanError } from "@/lib/errors";
import {
  PageHeader,
  SectionCard,
  EmptyState,
  LoadingRows,
  ErrorBanner,
} from "@/components/dashboard/ui";
import { ShieldAlert, RotateCcw, Save, Eye, Mail } from "lucide-react";
import { useViewerTimezone } from "@/lib/useViewerTimezone";

const EMPTY_DRAFT = {
  subject: "",
  heading: "",
  body: "",
  buttonLabel: "",
  buttonUrl: "",
};

function draftOf(template) {
  if (!template) return EMPTY_DRAFT;
  const { subject, heading, body, buttonLabel, buttonUrl } = template.current;
  return {
    subject,
    heading,
    body,
    buttonLabel: buttonLabel ?? "",
    buttonUrl: buttonUrl ?? "",
  };
}

function sameDraft(a, b) {
  return Object.keys(EMPTY_DRAFT).every((key) => (a[key] ?? "") === (b[key] ?? ""));
}

export default function AdminEmailsPage() {
  const timezone = useViewerTimezone();
  const me = useQuery(api.users.me);
  const isAdmin = !!me && me.role === "admin";
  const templates = useQuery(api.adminEmails.list, isAdmin ? {} : "skip");
  const save = useMutation(api.adminEmails.save);
  const resetToDefault = useMutation(api.adminEmails.resetToDefault);
  const setEnabled = useMutation(api.adminEmails.setEnabled);

  const [selectedKey, setSelectedKey] = useState(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [debounced, setDebounced] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef(null);

  const selected = useMemo(
    () => (templates ?? []).find((item) => item.key === selectedKey) ?? null,
    [templates, selectedKey]
  );

  // Load the first template, and reload the editor whenever the saved copy
  // changes underneath us (another admin saving, or a reset).
  const savedSignature = selected ? `${selected.key}:${selected.updatedAt ?? "default"}` : null;
  const loadedRef = useRef(null);
  useEffect(() => {
    if (!templates || templates.length === 0) return;
    if (!selectedKey) {
      setSelectedKey(templates[0].key);
      return;
    }
    if (savedSignature && loadedRef.current !== savedSignature) {
      loadedRef.current = savedSignature;
      setDraft(draftOf(selected));
    }
  }, [templates, selectedKey, savedSignature, selected]);

  // The preview is rendered on the server, so debounce the keystrokes.
  useEffect(() => {
    if (!draft.subject && !draft.body) return; // nothing loaded yet
    const id = setTimeout(() => setDebounced(draft), 400);
    return () => clearTimeout(id);
  }, [draft]);

  const preview = useQuery(
    api.adminEmails.preview,
    isAdmin && selectedKey && debounced ? { key: selectedKey, draft: debounced } : "skip"
  );

  if (me === undefined) return <LoadingRows rows={3} />;
  if (!isAdmin) {
    return (
      <div className="card">
        <EmptyState
          compact
          icon={ShieldAlert}
          title="Admins only"
          message="You need administrator access to view this page."
        />
      </div>
    );
  }

  const dirty = selected ? !sameDraft(draft, draftOf(selected)) : false;
  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }));

  /** Drop a {{placeholder}} in at the cursor. */
  function insertPlaceholder(name) {
    const token = `{{${name}}}`;
    const el = bodyRef.current;
    if (!el) {
      setDraft((d) => ({ ...d, body: `${d.body}${token}` }));
      return;
    }
    const { selectionStart: start, selectionEnd: end, value } = el;
    const next = `${value.slice(0, start)}${token}${value.slice(end)}`;
    setDraft((d) => ({ ...d, body: next }));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function onSave() {
    if (!selected) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await save({ key: selected.key, ...draft, enabled: true });
      loadedRef.current = null; // pick the saved copy back up
      setNotice("Saved — this version will be used for new emails.");
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onReset() {
    if (!selected) return;
    if (
      !window.confirm(
        `Discard your edits to "${selected.label}" and go back to the built-in email?`
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await resetToDefault({ key: selected.key });
      loadedRef.current = null;
      setDraft({
        subject: selected.defaults.subject,
        heading: selected.defaults.heading,
        body: selected.defaults.body,
        buttonLabel: selected.defaults.buttonLabel ?? "",
        buttonUrl: selected.defaults.buttonUrl ?? "",
      });
      setNotice("Reset — the built-in email is in use again.");
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onToggleEnabled() {
    if (!selected?.customised) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await setEnabled({ key: selected.key, enabled: !selected.enabled });
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Emails" />

      <ErrorBanner message={error} onDismiss={() => setError("")} />
      {notice ? (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {notice}
        </div>
      ) : null}

      {templates === undefined ? (
        <div className="card">
          <LoadingRows rows={5} />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Template list */}
          <div className="lg:col-span-4">
            <SectionCard title={`Templates (${templates.length})`}>
              <ul className="-mx-2 max-h-[32rem] space-y-1 overflow-y-auto">
                {templates.map((template) => {
                  const active = template.key === selectedKey;
                  return (
                    <li key={template.key}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedKey(template.key);
                          loadedRef.current = null;
                          setNotice("");
                          setError("");
                        }}
                        className={`w-full rounded-xl px-3 py-2.5 text-left transition-colors ${
                          active ? "bg-brand-50 ring-1 ring-brand-200" : "hover:bg-slate-50"
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span
                            className={`truncate text-sm font-semibold ${
                              active ? "text-brand-700" : "text-slate-800"
                            }`}
                          >
                            {template.label}
                          </span>
                          {template.customised ? (
                            <span className={template.enabled ? "badge-blue" : "badge-gray"}>
                              {template.enabled ? "Edited" : "Paused"}
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {template.audience}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </SectionCard>
          </div>

          {/* Editor + preview */}
          <div className="space-y-6 lg:col-span-8">
            {selected ? (
              <>
                <SectionCard
                  title={selected.label}
                  action={
                    selected.customised ? (
                      <button
                        type="button"
                        className="btn-ghost px-3 py-1.5 text-xs"
                        disabled={busy}
                        onClick={onToggleEnabled}
                      >
                        {selected.enabled ? "Pause (send built-in)" : "Use my version"}
                      </button>
                    ) : null
                  }
                >
                  <p className="text-sm text-slate-600">{selected.description}</p>
                  {selected.customised && selected.updatedAt ? (
                    <p className="mt-1 text-xs text-slate-400">
                      Edited {fmtDateTime(selected.updatedAt, timezone)}
                      {selected.updatedByName ? ` by ${selected.updatedByName}` : ""}
                      {selected.enabled ? "" : " — currently paused, the built-in email is sent"}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">
                      Using the built-in email. Saving your edits switches to your version.
                    </p>
                  )}

                  <div className="mt-5 space-y-4">
                    <div>
                      <label className="label" htmlFor="subject">
                        Subject line
                      </label>
                      <input
                        id="subject"
                        className="input"
                        value={draft.subject}
                        onChange={set("subject")}
                      />
                    </div>

                    <div>
                      <label className="label" htmlFor="heading">
                        Heading (the bold line inside the email)
                      </label>
                      <input
                        id="heading"
                        className="input"
                        value={draft.heading}
                        onChange={set("heading")}
                      />
                    </div>

                    <div>
                      <label className="label" htmlFor="body">
                        Body
                      </label>
                      <textarea
                        id="body"
                        ref={bodyRef}
                        rows={10}
                        className="input font-mono text-sm"
                        value={draft.body}
                        onChange={set("body")}
                      />
                      <p className="mt-1 text-xs text-slate-400">
                        Blank lines start a new paragraph. Wrap text in **double asterisks** to
                        make it bold.
                      </p>
                    </div>

                    <div>
                      <span className="label">Placeholders — click to insert</span>
                      <div className="flex flex-wrap gap-1.5">
                        {selected.placeholders.map((name) => (
                          <button
                            key={name}
                            type="button"
                            onClick={() => insertPlaceholder(name)}
                            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs text-slate-600 hover:border-brand-300 hover:text-brand-700"
                          >
                            {`{{${name}}}`}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="label" htmlFor="buttonLabel">
                          Button label (optional)
                        </label>
                        <input
                          id="buttonLabel"
                          className="input"
                          value={draft.buttonLabel}
                          onChange={set("buttonLabel")}
                        />
                      </div>
                      <div>
                        <label className="label" htmlFor="buttonUrl">
                          Button link
                        </label>
                        <input
                          id="buttonUrl"
                          className="input font-mono text-sm"
                          value={draft.buttonUrl}
                          onChange={set("buttonUrl")}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      className="btn-primary gap-2 px-5 py-2.5 text-sm"
                      disabled={busy || !dirty}
                      onClick={onSave}
                    >
                      <Save className="h-4 w-4" />
                      {busy ? "Saving…" : dirty ? "Save changes" : "Saved"}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary gap-2 px-5 py-2.5 text-sm"
                      disabled={busy || !selected.customised}
                      onClick={onReset}
                    >
                      <RotateCcw className="h-4 w-4" /> Reset to default
                    </button>
                    {dirty ? (
                      <span className="text-xs font-medium text-yellow-700">
                        Unsaved changes — the preview below shows your draft.
                      </span>
                    ) : null}
                  </div>
                </SectionCard>

                <SectionCard
                  title="Preview"
                  action={
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                      <Eye className="h-3.5 w-3.5" /> sample values
                    </span>
                  }
                >
                  {preview === undefined ? (
                    <LoadingRows rows={4} />
                  ) : (
                    <>
                      <p className="flex flex-wrap items-baseline gap-2 text-sm">
                        <span className="inline-flex items-center gap-1.5 text-slate-400">
                          <Mail className="h-4 w-4" /> Subject:
                        </span>
                        <span className="font-semibold text-slate-800">{preview.subject}</span>
                      </p>
                      <iframe
                        title="Email preview"
                        sandbox=""
                        srcDoc={preview.html}
                        className="mt-3 h-[26rem] w-full rounded-xl border border-slate-200 bg-white"
                      />
                    </>
                  )}
                </SectionCard>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
