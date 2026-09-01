"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { fmtDateTime } from "@/lib/format";
import {
  PageHeader,
  SectionCard,
  EmptyState,
  LoadingRows,
  Avatar,
} from "@/components/dashboard/ui";
import { MessagesSquare, MousePointerClick, MessageCircleOff, ShieldAlert } from "lucide-react";
import { useViewerTimezone } from "@/lib/useViewerTimezone";

export default function AdminConversationsPage() {
  const timezone = useViewerTimezone();
  const me = useQuery(api.users.me);
  const isAdmin = !!me && me.role === "admin";
  const conversations = useQuery(api.messages.allConversations, isAdmin ? {} : "skip");

  const [selectedId, setSelectedId] = useState(null);
  const thread = useQuery(
    api.messages.thread,
    isAdmin && selectedId ? { conversationId: selectedId } : "skip"
  );

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
        title="Conversations"
        description="Read-only view of student–tutor message threads for moderation and dispute resolution."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="All conversations">
          {conversations === undefined ? (
            <LoadingRows rows={4} />
          ) : conversations.length === 0 ? (
            <EmptyState
              compact
              icon={MessagesSquare}
              title="No conversations yet"
              message="Student–tutor threads will appear here as soon as people start messaging."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Tutor</th>
                    <th>Last message</th>
                  </tr>
                </thead>
                <tbody>
                  {conversations.map((conversation) => (
                    <tr
                      key={conversation._id}
                      onClick={() => setSelectedId(conversation._id)}
                      className={`cursor-pointer transition-colors ${
                        selectedId === conversation._id
                          ? "bg-brand-50"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <td>
                        <span className="flex items-center gap-3 font-medium text-slate-800">
                          <Avatar name={conversation.studentName} size="h-8 w-8 text-xs" />
                          {conversation.studentName}
                        </span>
                      </td>
                      <td>{conversation.tutorName}</td>
                      <td>
                        <p className="max-w-[16rem] truncate text-slate-600">
                          {conversation.lastMessagePreview || "—"}
                        </p>
                        <p className="text-xs text-slate-400">
                          {conversation.lastMessageAt
                            ? fmtDateTime(conversation.lastMessageAt, timezone)
                            : ""}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Thread">
          {!selectedId ? (
            <EmptyState
              compact
              icon={MousePointerClick}
              title="No conversation selected"
              message="Select a conversation on the left to read the thread."
            />
          ) : thread === undefined ? (
            <LoadingRows rows={3} />
          ) : !thread ? (
            <EmptyState
              compact
              icon={MessageCircleOff}
              title="Conversation not found"
              message="This thread may have been removed."
            />
          ) : (
            <div>
              <h3 className="mb-4 flex items-center gap-3 font-bold text-slate-900">
                <Avatar name={thread.conversation.studentName} size="h-8 w-8 text-xs" />
                {thread.conversation.studentName} ↔ {thread.conversation.tutorName}
              </h3>
              {thread.messages.length === 0 ? (
                <EmptyState
                  compact
                  icon={MessageCircleOff}
                  title="No messages"
                  message="This thread has no messages yet."
                />
              ) : (
                <ul className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">
                  {thread.messages.map((message) => {
                    const fromStudent =
                      message.senderId === thread.conversation.studentId;
                    return (
                      <li
                        key={message._id}
                        className={`flex ${fromStudent ? "justify-start" : "justify-end"}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                            fromStudent
                              ? "bg-slate-100 text-slate-800"
                              : "bg-brand-100 text-brand-900"
                          }`}
                        >
                          <p className="mb-0.5 text-xs font-semibold">
                            {fromStudent
                              ? thread.conversation.studentName
                              : thread.conversation.tutorName}
                          </p>
                          <p className="whitespace-pre-line">{message.body}</p>
                          <p className="mt-1 text-xs opacity-60">
                            {fmtDateTime(message.sentAt, timezone)}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
