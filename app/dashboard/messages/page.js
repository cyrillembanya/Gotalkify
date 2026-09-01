"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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
import { MessagesSquare, MessageCircle, Send } from "lucide-react";
import { useViewerTimezone } from "@/lib/useViewerTimezone";

function Thread({ conversationId, me }) {
  const timezone = useViewerTimezone();
  const data = useQuery(api.messages.thread, { conversationId });
  const send = useMutation(api.messages.send);
  const markRead = useMutation(api.messages.markRead);
  const [body, setBody] = useState("");
  const [error, setError] = useState(null);
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

  async function onSend(e) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setError(null);
    setBody("");
    try {
      await send({ conversationId, body: text });
    } catch (err) {
      setError("Could not send message.");
      setBody(text);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        <Avatar name={otherName} size="h-8 w-8 text-xs" />
        <p className="font-semibold text-slate-900">{otherName}</p>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
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
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                    mine
                      ? "rounded-br-md bg-brand-600 text-white"
                      : "rounded-bl-md bg-slate-100 text-slate-800"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{message.body}</p>
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
        <form onSubmit={onSend} className={`flex items-center gap-2 ${error ? "mt-2" : ""}`}>
          <input
            className="input flex-1 rounded-xl"
            placeholder="Write a message…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={4000}
          />
          <button
            className="btn-primary gap-1.5 rounded-xl px-4 py-2 text-sm"
            disabled={!body.trim()}
          >
            <Send className="h-4 w-4" /> Send
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

  if (!me) return <LoadingRows rows={4} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Messages"
        description="Chat with your tutors and students in real time."
      />

      <div className="card grid h-[70vh] grid-cols-1 overflow-hidden p-0 md:grid-cols-3">
        <div className={`border-r border-slate-100 md:block ${selected ? "hidden" : ""}`}>
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="font-bold text-slate-900">Conversations</p>
          </div>
          <div className="h-full overflow-y-auto">
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
                  className={`flex w-full items-center gap-3 border-b border-slate-50 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
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
        <div className={`md:col-span-2 md:block ${selected ? "" : "hidden"}`}>
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
