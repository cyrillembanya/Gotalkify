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
import {
  Video,
  MousePointerClick,
  MessageCircleOff,
  ShieldAlert,
  Info,
} from "lucide-react";
import { AttachmentBubble } from "@/components/chat/Attachment";
import { useViewerTimezone } from "@/lib/useViewerTimezone";

function lessonBadge(room) {
  if (room.lessonType === "trial") return <span className="badge-yellow">Trial</span>;
  if (!room.lessonStatus) return <span className="badge-gray">Lesson removed</span>;
  return <span className="badge-gray">{room.lessonStatus}</span>;
}

export default function AdminClassroomChatsPage() {
  const timezone = useViewerTimezone();
  const me = useQuery(api.users.me);
  const isAdmin = !!me && me.role === "admin";
  const index = useQuery(api.video.adminClassroomChats, isAdmin ? {} : "skip");

  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const transcript = useQuery(
    api.video.adminClassroomChat,
    isAdmin && selectedRoomId ? { roomId: selectedRoomId } : "skip"
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
        title="Classroom chats"
        description="Read-only view of the in-class chat from each lesson, for support, safety and dispute resolution."
      />

      <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <p>
          In-class chat is kept for{" "}
          <span className="font-semibold text-slate-800">
            {index ? `${index.retentionDays} days` : "a limited window"}
          </span>{" "}
          after each lesson and then deleted automatically. Older classrooms are
          not recoverable here — the student&#8203;–tutor{" "}
          <span className="font-medium">Conversations</span> threads are kept
          indefinitely.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Classrooms with chat">
          {index === undefined ? (
            <LoadingRows rows={4} />
          ) : index.rooms.length === 0 ? (
            <EmptyState
              compact
              icon={Video}
              title="No classroom chat on record"
              message="Messages typed during a live lesson will appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Lesson</th>
                    <th>Participants</th>
                    <th>Last message</th>
                  </tr>
                </thead>
                <tbody>
                  {index.rooms.map((room) => (
                    <tr
                      key={room.roomId}
                      onClick={() => setSelectedRoomId(room.roomId)}
                      className={`cursor-pointer transition-colors ${
                        selectedRoomId === room.roomId
                          ? "bg-brand-50"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <td>
                        <p className="font-medium text-slate-800">
                          {room.lessonStartUTC
                            ? fmtDateTime(room.lessonStartUTC, timezone)
                            : "—"}
                        </p>
                        <p className="mt-1">{lessonBadge(room)}</p>
                      </td>
                      <td>
                        <span className="flex items-center gap-3 font-medium text-slate-800">
                          <Avatar name={room.studentName} size="h-8 w-8 text-xs" />
                          {room.studentName}
                        </span>
                        <p className="mt-1 text-xs text-slate-400">
                          with {room.tutorName}
                        </p>
                      </td>
                      <td>
                        <p className="max-w-[16rem] truncate text-slate-600">
                          {room.lastMessagePreview || "—"}
                        </p>
                        <p className="text-xs text-slate-400">
                          {fmtDateTime(room.lastMessageAt, timezone)} ·{" "}
                          {room.messageCount} message
                          {room.messageCount === 1 ? "" : "s"}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {index.truncated ? (
                <p className="mt-4 text-xs text-slate-400">
                  Showing the most recent classrooms only — older ones within the
                  retention window may not be listed.
                </p>
              ) : null}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Transcript">
          {!selectedRoomId ? (
            <EmptyState
              compact
              icon={MousePointerClick}
              title="No classroom selected"
              message="Select a classroom on the left to read its chat."
            />
          ) : transcript === undefined ? (
            <LoadingRows rows={3} />
          ) : !transcript ? (
            <EmptyState
              compact
              icon={MessageCircleOff}
              title="Transcript no longer available"
              message="This classroom's chat has passed its retention window and been deleted."
            />
          ) : (
            <div>
              <h3 className="mb-1 flex items-center gap-3 font-bold text-slate-900">
                <Avatar name={transcript.studentName} size="h-8 w-8 text-xs" />
                {transcript.studentName} ↔ {transcript.tutorName}
              </h3>
              <p className="mb-4 text-xs text-slate-400">
                {transcript.lessonStartUTC
                  ? fmtDateTime(transcript.lessonStartUTC, timezone, {
                      withZone: true,
                    })
                  : "Lesson no longer on record"}
              </p>
              <ul className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">
                {transcript.messages.map((message) => {
                  const fromStudent = message.userId === transcript.studentId;
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
                        <p className="mb-0.5 text-xs font-semibold">{message.name}</p>
                        <AttachmentBubble message={message} />
                        {message.text ? (
                          <p className="whitespace-pre-line">{message.text}</p>
                        ) : null}
                        <p className="mt-1 text-xs opacity-60">
                          {fmtDateTime(message.sentAt, timezone)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
