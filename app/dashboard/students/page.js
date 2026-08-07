"use client";

import Link from "next/link";
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
import { Lock, Users } from "lucide-react";

export default function StudentsPage() {
  const me = useQuery(api.users.me);
  const students = useQuery(
    api.tutors.myStudents,
    me?.role === "tutor" ? {} : "skip"
  );

  if (me && me.role !== "tutor") {
    return (
      <div className="space-y-6">
        <PageHeader title="My students" />
        <div className="card">
          <EmptyState
            compact
            icon={Lock}
            title="Tutors only"
            message="This page is for tutors only."
          />
        </div>
      </div>
    );
  }
  if (me === undefined || !me || students === undefined) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="My students"
          description="Everyone who has booked lessons with you."
        />
        <div className="card">
          <LoadingRows rows={4} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My students"
        description="Everyone who has booked lessons with you."
      />

      <SectionCard title="Students">
        {students.length === 0 ? (
          <EmptyState
            compact
            icon={Users}
            title="No students yet"
            message="Keep your availability up to date and your profile polished — students find tutors with open time slots first."
            action="Edit availability"
            href="/dashboard/availability"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Lessons completed</th>
                  <th>Hours remaining</th>
                  <th>Next lesson</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.studentId} className="transition-colors hover:bg-slate-50">
                    <td>
                      <span className="flex items-center gap-3 font-medium text-slate-900">
                        <Avatar name={s.name} size="h-8 w-8 text-xs" />
                        {s.name}
                      </span>
                    </td>
                    <td>{s.lessonsCompleted}</td>
                    <td>{(s.minutesRemaining / 60).toFixed(1)}</td>
                    <td>
                      {s.nextLessonUTC
                        ? fmtDateTime(s.nextLessonUTC, me.timezone)
                        : "—"}
                    </td>
                    <td className="text-right">
                      {s.conversationId ? (
                        <Link
                          href={`/dashboard/messages?c=${s.conversationId}`}
                          className="btn-secondary px-4 py-2 text-sm"
                        >
                          Message
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
