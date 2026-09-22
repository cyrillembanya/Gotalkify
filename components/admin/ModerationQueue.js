"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { fmtDateTime } from "@/lib/format";
import { cleanError } from "@/components/admin/helpers";
import {
  SectionCard,
  EmptyState,
  LoadingRows,
  ErrorBanner,
  Avatar,
} from "@/components/dashboard/ui";
import { useViewerTimezone } from "@/lib/useViewerTimezone";
import {
  CheckCheck,
  Lock,
  LockOpen,
  MousePointerClick,
  ShieldCheck,
  Undo2,
} from "lucide-react";

const SEVERITY_BADGE = {
  flag: "badge-yellow",
  block_message: "badge-blue",
  block_chat: "badge-red",
};

const SEVERITY_LABEL = {
  flag: "Flagged",
  block_message: "Message blocked",
  block_chat: "Chat closed",
};

const CATEGORY_LABEL = {
  personal_info: "Personal information",
  contact_evasion: "Off-platform contact",
  profanity: "Vulgar language",
  hate: "Racial / hateful language",
  sexual: "Sexual content",
  manual: "Closed by an admin",
};

const STATUS_TABS = [
  { id: "open", label: "Needs review" },
  { id: "reviewed", label: "Reviewed" },
  { id: "dismissed", label: "Dismissed" },
  { id: "all", label: "Everything" },
];

/** The review queue: every message the filter caught. */
export function ModerationFlags({ initialFlagId }) {
  const timezone = useViewerTimezone();
  const [status, setStatus] = useState("open");
  const [selectedId, setSelectedId] = useState(initialFlagId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const flags = useQuery(api.moderation.flags, { status });
  const reviewFlag = useMutation(api.moderation.reviewFlag);
  const unblockChat = useMutation(api.moderation.unblockChat);

  // A link from a safety alert opens straight onto that flag, whatever tab it
  // is filed under.
  useEffect(() => {
    if (initialFlagId) setStatus("all");
  }, [initialFlagId]);

  const selected = flags?.find((flag) => flag._id === selectedId) ?? null;

  async function run(action) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <SectionCard title="Flagged messages">
        <div className="mb-4 flex flex-wrap gap-1.5">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatus(tab.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                status === tab.id
                  ? "bg-brand-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:text-brand-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {flags === undefined ? (
          <LoadingRows rows={4} />
        ) : flags.length === 0 ? (
          <EmptyState
            compact
            icon={ShieldCheck}
            title={status === "open" ? "Nothing to review" : "Nothing here"}
            message={
              status === "open"
                ? "No flagged message is waiting for an admin. Chats are being filtered as people write."
                : "No flagged message matches this filter."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Sender</th>
                  <th>What happened</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {flags.map((flag) => (
                  <tr
                    key={flag._id}
                    onClick={() => setSelectedId(flag._id)}
                    className={`cursor-pointer transition-colors ${
                      selectedId === flag._id ? "bg-brand-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <td data-primary>
                      <span className="flex items-center gap-3 font-medium text-slate-800">
                        <Avatar name={flag.senderName} size="h-8 w-8 text-xs" />
                        <span className="min-w-0">
                          <span className="block truncate">{flag.senderName}</span>
                          <span className="block text-xs font-normal text-slate-500">
                            {flag.senderRole} ·{" "}
                            {flag.surface === "classroom" ? "classroom" : "messages"}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td data-label="What happened">
                      <div className="min-w-0 space-y-1">
                        <span className={SEVERITY_BADGE[flag.severity] ?? "badge-gray"}>
                          {SEVERITY_LABEL[flag.severity] ?? flag.severity}
                        </span>
                        <p className="max-w-[16rem] truncate text-xs text-slate-500">
                          {flag.categories
                            .map((key) => CATEGORY_LABEL[key] ?? key)
                            .join(", ")}
                        </p>
                      </div>
                    </td>
                    <td data-label="When">
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500">
                          {fmtDateTime(flag.createdAt, timezone)}
                        </p>
                        {flag.chatStillBlocked ? (
                          <p className="text-xs font-semibold text-red-600">Chat closed</p>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Detail">
        <ErrorBanner message={error} onDismiss={() => setError("")} />
        {!selected ? (
          <EmptyState
            compact
            icon={MousePointerClick}
            title="No flag selected"
            message="Pick a flagged message on the left to see the full text and decide what to do."
          />
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={SEVERITY_BADGE[selected.severity] ?? "badge-gray"}>
                {SEVERITY_LABEL[selected.severity] ?? selected.severity}
              </span>
              <span className="badge-gray">
                {selected.surface === "classroom" ? "Classroom chat" : "Direct messages"}
              </span>
              <span className="badge-gray">{selected.status}</span>
            </div>

            <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-slate-500">Sent by</dt>
              <dd className="text-slate-800">
                {selected.senderName} ({selected.senderRole})
              </dd>
              <dt className="text-slate-500">Categories</dt>
              <dd className="text-slate-800">
                {selected.categories.map((key) => CATEGORY_LABEL[key] ?? key).join(", ")}
              </dd>
              <dt className="text-slate-500">Rules</dt>
              <dd className="text-slate-800">{selected.ruleLabels.join(", ")}</dd>
              <dt className="text-slate-500">Matched</dt>
              <dd className="font-mono text-slate-800">{selected.matches.join(" | ")}</dd>
              <dt className="text-slate-500">When</dt>
              <dd className="text-slate-800">
                {fmtDateTime(selected.createdAt, timezone)}
              </dd>
              {selected.reviewedByName ? (
                <>
                  <dt className="text-slate-500">Reviewed by</dt>
                  <dd className="text-slate-800">{selected.reviewedByName}</dd>
                </>
              ) : null}
            </dl>

            <div>
              <p className="label">The message</p>
              <p className="whitespace-pre-wrap break-words rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-800">
                {selected.body || "(attachment only)"}
              </p>
            </div>

            {selected.reviewNote ? (
              <div>
                <p className="label">Review note</p>
                <p className="text-sm text-slate-600">{selected.reviewNote}</p>
              </div>
            ) : null}

            {selected.chatStillBlocked ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <p className="flex items-center gap-2 font-semibold">
                  <Lock className="h-4 w-4" />
                  This chat is closed
                </p>
                <p className="mt-1">
                  Both people have been emailed to contact the help desk. Reopening it
                  lets them message each other again and emails them both.
                </p>
                <button
                  type="button"
                  className="btn-secondary mt-3 gap-1.5"
                  disabled={busy}
                  onClick={() => {
                    const note = window.prompt(
                      "Note for the student and tutor (optional):",
                      ""
                    );
                    if (note === null) return;
                    run(() => unblockChat({ id: selected.blockId, note }));
                  }}
                >
                  <LockOpen className="h-4 w-4" />
                  Reopen this chat
                </button>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {selected.status === "open" ? (
                <>
                  <button
                    type="button"
                    className="btn-primary gap-1.5"
                    disabled={busy}
                    onClick={() =>
                      run(() => reviewFlag({ id: selected._id, status: "reviewed" }))
                    }
                  >
                    <CheckCheck className="h-4 w-4" />
                    Mark reviewed
                  </button>
                  <button
                    type="button"
                    className="btn-secondary gap-1.5"
                    disabled={busy}
                    onClick={() => {
                      const note = window.prompt("Why is this a false alarm?", "");
                      if (note === null) return;
                      run(() =>
                        reviewFlag({ id: selected._id, status: "dismissed", note })
                      );
                    }}
                  >
                    False alarm
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn-secondary gap-1.5"
                  disabled={busy}
                  onClick={() => run(() => reviewFlag({ id: selected._id, status: "open" }))}
                >
                  <Undo2 className="h-4 w-4" />
                  Reopen for review
                </button>
              )}
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

/** Every chat the filter (or an admin) has closed. */
export function ModerationBlocks() {
  const timezone = useViewerTimezone();
  const [includeLifted, setIncludeLifted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const blocks = useQuery(api.moderation.blocks, { includeLifted });
  const unblockChat = useMutation(api.moderation.unblockChat);

  async function lift(block) {
    const note = window.prompt("Note for the student and tutor (optional):", "");
    if (note === null) return;
    setBusy(true);
    setError("");
    try {
      await unblockChat({ id: block._id, note });
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard
      title="Closed chats"
      action={
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={includeLifted}
            onChange={(event) => setIncludeLifted(event.target.checked)}
          />
          Include reopened
        </label>
      }
    >
      <ErrorBanner message={error} onDismiss={() => setError("")} />
      {blocks === undefined ? (
        <LoadingRows rows={3} />
      ) : blocks.length === 0 ? (
        <EmptyState
          compact
          icon={ShieldCheck}
          title="No closed chats"
          message="Nothing is blocked right now. Chats close automatically when contact details or hateful language are shared."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Chat</th>
                <th>Why</th>
                <th>Closed</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {blocks.map((block) => (
                <tr key={block._id} className={block.active ? "" : "opacity-60"}>
                  <td data-primary>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800">
                        {block.studentName} ↔ {block.tutorName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {block.scope === "room" ? "Classroom chat" : "Direct messages"}
                      </p>
                    </div>
                  </td>
                  <td data-label="Why">
                    <div className="min-w-0">
                      <p className="max-w-[16rem] truncate text-slate-600">
                        {block.reason}
                      </p>
                      <p className="text-xs text-slate-400">
                        {CATEGORY_LABEL[block.category] ?? block.category}
                      </p>
                    </div>
                  </td>
                  <td data-label="Closed">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500">
                        {fmtDateTime(block.createdAt, timezone)}
                      </p>
                      {block.active ? null : (
                        <p className="text-xs text-green-600">
                          Reopened{block.liftedByName ? ` by ${block.liftedByName}` : ""}
                        </p>
                      )}
                    </div>
                  </td>
                  <td data-actions>
                    {block.active ? (
                      <button
                        type="button"
                        className="btn-secondary gap-1.5"
                        disabled={busy}
                        onClick={() => lift(block)}
                      >
                        <LockOpen className="h-4 w-4" />
                        Reopen
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
