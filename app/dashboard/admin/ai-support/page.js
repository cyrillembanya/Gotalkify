"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { fmtDateTime } from "@/lib/format";
import { cleanError } from "@/components/admin/helpers";
import Link from "next/link";
import {
  PageHeader,
  SectionCard,
  EmptyState,
  LoadingRows,
  ErrorBanner,
  Avatar,
} from "@/components/dashboard/ui";
import {
  Bot,
  Headset,
  ShieldAlert,
  MousePointerClick,
  Settings,
} from "lucide-react";
import { useViewerTimezone } from "@/lib/useViewerTimezone";

/* -------------------------------- conversations ------------------------------- */

function statusBadge(status) {
  if (status === "waiting") return <span className="badge-yellow">Needs reply</span>;
  if (status === "answered") return <span className="badge-green">Answered</span>;
  if (status === "closed") return <span className="badge-gray">Closed</span>;
  return <span className="badge-gray">Bot</span>;
}

function ChatThread({ chatId, timezone }) {
  const chat = useQuery(api.support.adminChat, { chatId });
  const reply = useAction(api.support.adminReply);
  const markRead = useMutation(api.support.markChatRead);
  const close = useMutation(api.support.closeChat);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    markRead({ chatId }).catch(() => {});
  }, [chatId, markRead]);

  if (chat === undefined) return <LoadingRows rows={3} />;
  if (!chat) {
    return (
      <EmptyState
        compact
        icon={Headset}
        title="Conversation not found"
        message="It may have been removed."
      />
    );
  }

  async function onReply(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setError("");
    try {
      await reply({ chatId, text: body });
      setText("");
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 font-bold text-slate-900">
            <Avatar name={chat.visitorName ?? "Visitor"} size="h-8 w-8 text-xs" />
            {chat.visitorName ?? "Visitor"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {chat.visitorEmail ?? "no email left"} · from {chat.pagePath ?? "/"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {statusBadge(chat.status)}
          {chat.status === "closed" ? null : (
            <button
              onClick={() => close({ chatId })}
              className="btn-secondary px-3 py-1.5 text-xs"
            >
              Close
            </button>
          )}
        </div>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError("")} />

      <ul className="max-h-[24rem] space-y-3 overflow-y-auto pr-1">
        {chat.messages.map((message) => {
          const fromVisitor = message.role === "visitor";
          return (
            <li
              key={message._id}
              className={`flex ${fromVisitor ? "justify-start" : "justify-end"}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                  fromVisitor
                    ? "bg-slate-100 text-slate-800"
                    : message.role === "admin"
                      ? "bg-brand-600 text-white"
                      : "border border-slate-200 bg-white text-slate-600"
                }`}
              >
                <p className="mb-0.5 text-xs font-semibold opacity-80">
                  {fromVisitor
                    ? chat.visitorName ?? "Visitor"
                    : message.role === "admin"
                      ? message.authorName ?? "Support"
                      : "Assistant"}
                </p>
                <p className="whitespace-pre-line">{message.text}</p>
                <p className="mt-1 text-[11px] opacity-60">
                  {fmtDateTime(message.createdAt, timezone)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <form onSubmit={onReply} className="space-y-2">
        <textarea
          rows={3}
          className="input text-sm"
          placeholder={
            chat.visitorEmail
              ? "Your reply appears in the visitor's chat and is emailed to them."
              : "Your reply appears in the visitor's chat (no email was left)."
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn-primary gap-2 py-2 text-sm" disabled={busy || !text.trim()}>
          <Headset className="h-4 w-4" />
          {busy ? "Sending…" : "Send reply"}
        </button>
      </form>
    </div>
  );
}

function Conversations({ timezone }) {
  const chats = useQuery(api.support.adminChats);
  const [selected, setSelected] = useState(null);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <SectionCard title="Chats">
        {chats === undefined ? (
          <LoadingRows rows={4} />
        ) : chats.length === 0 ? (
          <EmptyState
            compact
            icon={Bot}
            title="No conversations yet"
            message="Chats from the website widget will appear here."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {chats.map((chat) => (
              <li key={chat._id}>
                <button
                  onClick={() => setSelected(chat._id)}
                  className={`flex w-full items-start gap-3 px-1 py-3 text-left transition-colors hover:bg-slate-50 ${
                    selected === chat._id ? "bg-brand-50" : ""
                  }`}
                >
                  <Avatar name={chat.visitorName ?? "Visitor"} size="h-8 w-8 text-xs" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-semibold text-slate-800">
                      {chat.visitorName ?? "Visitor"}
                      {statusBadge(chat.status)}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {chat.lastMessagePreview || "—"}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {fmtDateTime(chat.lastMessageAt, timezone)}
                    </p>
                  </div>
                  {chat.adminUnread > 0 ? (
                    <span className="shrink-0 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {chat.adminUnread}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Conversation">
        {selected ? (
          <ChatThread key={selected} chatId={selected} timezone={timezone} />
        ) : (
          <EmptyState
            compact
            icon={MousePointerClick}
            title="No conversation selected"
            message="Pick a chat on the left to read it and reply."
          />
        )}
      </SectionCard>
    </div>
  );
}

/* ----------------------------------- page ----------------------------------- */

export default function AdminAiSupportPage() {
  const timezone = useViewerTimezone();
  const me = useQuery(api.users.me);
  const isAdmin = !!me && me.role === "admin";
  const waiting = useQuery(api.support.waitingCount, isAdmin ? {} : "skip");

  if (me === undefined) return <LoadingRows rows={4} />;
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI support messages"
        description="Conversations from the website chat widget, including the ones the assistant handed to your team."
      >
        <Link href="/dashboard/admin/settings" className="btn-secondary gap-2">
          <Settings className="h-4 w-4" />
          Assistant settings
        </Link>
      </PageHeader>

      {waiting ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-yellow-200 bg-yellow-50 px-5 py-4 text-sm text-yellow-800">
          <p className="flex items-center gap-2 font-medium">
            <Headset className="h-4 w-4 shrink-0" />
            {waiting} conversation{waiting > 1 ? "s" : ""} waiting for a reply from your
            team.
          </p>
        </div>
      ) : null}

      <Conversations timezone={timezone} />
    </div>
  );
}
