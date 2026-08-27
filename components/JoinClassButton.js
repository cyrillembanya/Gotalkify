"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Check, Copy, Loader2, Video } from "lucide-react";

/** Must match JOIN_OPENS_BEFORE_MS / JOIN_CLOSES_AFTER_MS in convex/video.js. */
const OPENS_BEFORE_MS = 15 * 60 * 1000;
const CLOSES_AFTER_MS = 60 * 60 * 1000;

export function classPath(roomId) {
  return `/class/${roomId}`;
}

/**
 * "Join the class" — the tutor's and the student's way into the built-in
 * classroom. Older lessons booked before the feature existed get their room
 * token minted on the first click.
 */
export default function JoinClassButton({ lesson, showCopy = false, className = "" }) {
  const router = useRouter();
  const ensureRoom = useMutation(api.video.ensureRoomForLesson);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const live = now >= lesson.startUTC - OPENS_BEFORE_MS && now <= lesson.endUTC + CLOSES_AFTER_MS;
  const over = now > lesson.endUTC + CLOSES_AFTER_MS;
  if (over) return null;

  const tone = live
    ? "btn-primary"
    : "btn text-brand-700 border border-brand-200 bg-brand-50 hover:bg-brand-100";

  async function openWithoutRoom() {
    setBusy(true);
    try {
      const { roomId } = await ensureRoom({ lessonId: lesson._id });
      router.push(classPath(roomId));
    } catch {
      setBusy(false);
    }
  }

  async function copyLink() {
    let roomId = lesson.roomId;
    if (!roomId) {
      try {
        ({ roomId } = await ensureRoom({ lessonId: lesson._id }));
      } catch {
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${classPath(roomId)}`);
      setCopied(true);
    } catch {
      /* clipboard blocked — the link is still on the button */
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {lesson.roomId ? (
        <Link
          href={classPath(lesson.roomId)}
          className={`${tone} gap-1.5 px-4 py-2 text-sm ${className}`}
        >
          <Video className="h-4 w-4" /> Join the class
        </Link>
      ) : (
        <button
          type="button"
          onClick={openWithoutRoom}
          disabled={busy}
          className={`${tone} gap-1.5 px-4 py-2 text-sm ${className}`}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
          Join the class
        </button>
      )}

      {showCopy ? (
        <button
          type="button"
          onClick={copyLink}
          title="Copy the private class link"
          aria-label="Copy the private class link"
          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
          {copied ? (
            <Check className="h-4 w-4 text-green-600" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      ) : null}
    </span>
  );
}
