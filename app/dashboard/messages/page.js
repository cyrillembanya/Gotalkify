"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { fmtDateTime, fmtTime } from "@/lib/format";
import {
  PageHeader,
  EmptyState,
  LoadingRows,
  ErrorBanner,
  Avatar,
} from "@/components/dashboard/ui";
import { ArrowLeft, MessagesSquare, MessageCircle, Paperclip, Send } from "lucide-react";
import { useViewerTimezone } from "@/lib/useViewerTimezone";
import {
  ATTACHMENT_ACCEPT,
  checkAttachment,
  uploadAttachment,
} from "@/lib/attachments";
import { AttachmentBubble, PendingAttachment } from "@/components/chat/Attachment";

function Thread({ conversationId, me }) {
  const timezone = useViewerTimezone();
  const data = useQuery(api.messages.thread, { conversationId });
  const send = useMutation(api.messages.send);
  const markRead = useMutation(api.messages.markRead);
  const generateUploadUrl = useMutation(api.files.generateChatUploadUrl);
  const [body, setBody] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (data) markRead({ conversationId }).catch(() => {});
  }, [data?.messages?.length, conversationId, markRead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages?.length]);

  if (data === undefined) {
    return (
      <div className="p-6">
        <LoadingRows rows={4} />
      </div>
    );
  }
  if (data === null) {
    return (
      <EmptyState
        compact
        icon={MessageCircle}
        title="Conversation not found"
        message="This conversation doesn't exist or you don't have access to it."
      />
    );
  }

  const otherName =
    data.conversation.studentId === me._id
      ? data.conversation.tutorName
      : data.conversation.studentName;

  function pickFile(e) {
    const chosen = e.target.files?.[0];
    e.target.value = ""; // so the same file can be picked again after removing
    if (!chosen) return;
    const problem = checkAttachment(chosen);
    if (problem) return setError(problem);
    setError(null);
    setFile(chosen);
  }

  async function onSend(e) {
    e.preventDefault();
    const text = body.trim();
    if (!text && !file) return;
    setError(null);
    setBusy(true);
    try {
      const attachment = file ? await uploadAttachment(generateUploadUrl, file) : {};
      await send({ conversationId, body: text, ...attachment });
      setBody("");
      setFile(null);
    } catch (err) {
      setError("Could not send message.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-3 sm:gap-3 sm:px-4">
        <Link
          href="/dashboard/messages"
          className="-ml-1 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:hidden"
          aria-label="Back to conversations"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Avatar name={otherName} size="h-8 w-8 text-xs" />
        <p className="truncate font-semibold text-slate-900">{otherName}</p>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 sm:p-4">
        {data.messages.length === 0 ? (
          <EmptyState
            compact
            icon={MessageCircle}
            title="No messages yet"
            message="Say hello — this is the start of your conversation."
          />
        ) : (
          data.messages.map((message) => {
            const mine = message.senderId === me._id;
            return (
              <div key={message._id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] space-y-1.5 rounded-2xl px-3.5 py-2.5 text-sm sm:max-w-[75%] sm:px-4 ${
                    mine
                      ? "rounded-br-md bg-brand-600 text-white"
                      : "rounded-bl-md bg-slate-100 text-slate-800"
                  }`}
                >
                  <AttachmentBubble message={message} tone={mine ? "mine" : "light"} />
                  {message.body ? (
                    <p className="whitespace-pre-wrap break-words">{message.body}</p>
                  ) : null}
                  <p className={`mt-0.5 text-right text-[10px] ${mine ? "text-brand-200" : "text-slate-400"}`}>
                    {fmtTime(message.sentAt, timezone)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-slate-100 p-3">
        <ErrorBanner message={error} onDismiss={() => setError(null)} />
        <div className={error ? "mt-2" : ""}>
          <PendingAttachment file={file} onRemove={() => setFile(null)} disabled={busy} />
        </div>
        <form onSubmit={onSend} className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept={ATTACHMENT_ACCEPT}
            onChange={pickFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            aria-label="Attach a file"
            title="Attach a file"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-brand-600 disabled:opacity-40"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            className="input flex-1 rounded-xl"
            placeholder="Write a message…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={4000}
          />
          <button
            className="btn-primary h-10 gap-1.5 rounded-xl px-3 py-2 text-sm sm:px-4"
            disabled={busy || (!body.trim() && !file)}
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">{busy ? "Sending…" : "Send"}</span>
          </button>
        </form>
      </div>
    </div>
  );
}

function MessagesInner() {
  const me = useQuery(api.users.me);
  const conversations = useQuery(api.messages.myConversations);
  const searchParams = useSearchParams();
  const router = useRouter();
  const selected = searchParams.get("c");

  useEffect(() => {
    if (!selected || !window.matchMedia("(max-width: 767px)").matches) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [selected]);

  if (!me) return <LoadingRows rows={4} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Messages"
        description="Chat with your tutors and students in real time."
      />

      {/* Phones: the list is full-bleed and an open thread fills the space
          between the top bar and the bottom tabs. From md the two sit side
          by side inside one card. */}
      <div className="-mx-4 -mt-5 sm:-mx-6 sm:-mt-6 md:card md:mx-0 md:mt-0 md:grid md:h-[70vh] md:grid-cols-3 md:overflow-hidden md:!p-0">
        <div
          className={`min-h-0 flex-col border-slate-100 bg-white md:flex md:border-r ${
            selected ? "hidden" : "flex"
          }`}
        >
          <div className="hidden shrink-0 border-b border-slate-100 px-4 py-3 md:block">
            <p className="font-bold text-slate-900">Conversations</p>
          </div>
          <div className="min-h-0 md:flex-1 md:overflow-y-auto">
            {conversations === undefined ? (
              <div className="p-4">
                <LoadingRows rows={4} />
              </div>
            ) : conversations.length === 0 ? (
              <EmptyState
                compact
                icon={MessagesSquare}
                title="No conversations yet"
                message="Messaging unlocks when you book a trial or buy hours with a tutor."
              />
            ) : (
              conversations.map((conversation) => (
                <button
                  key={conversation._id}
                  onClick={() => router.push(`/dashboard/messages?c=${conversation._id}`)}
                  className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 md:border-slate-50 md:py-3 ${
                    selected === conversation._id ? "bg-brand-50" : ""
                  }`}
                >
                  <Avatar name={conversation.otherName} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {conversation.otherName}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {conversation.lastMessagePreview || "New conversation"}
                    </p>
                  </div>
                  {conversation.unread > 0 ? (
                    <span className="shrink-0 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {conversation.unread}
                    </span>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>
        <div
          className={`md:static md:z-auto md:col-span-2 md:flex md:min-h-0 md:flex-col ${
            selected
              ? "fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] top-16 z-20 flex flex-col bg-white"
              : "hidden"
          }`}
        >
          {selected ? (
            <Thread conversationId={selected} me={me} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <EmptyState
                compact
                icon={MessageCircle}
                title="Select a conversation"
                message="Pick a conversation from the list to start chatting."
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<LoadingRows rows={4} />}>
      <MessagesInner />
    </Suspense>
  );
}
