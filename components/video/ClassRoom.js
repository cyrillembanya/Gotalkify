"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { fmtDateTime } from "@/lib/format";
import { AlertTriangle, CalendarClock, Loader2, PhoneOff } from "lucide-react";
import { isSecureContextOk, isSupported } from "./media";
import { useLocalMedia } from "./useLocalMedia";
import { useVideoRoom } from "./useVideoRoom";
import PreJoin from "./PreJoin";
import CallStage from "./CallStage";
import { useViewerTimezone } from "@/lib/useViewerTimezone";

function Shell({ children }) {
  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-slate-900 text-slate-100">
      {children}
    </div>
  );
}

function Notice({ icon: Icon = AlertTriangle, title, children, action }) {
  return (
    <Shell>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-5 py-16">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
            <Icon className="h-6 w-6 text-accent-300" />
          </div>
          <h1 className="text-xl font-bold text-white">{title}</h1>
          {children ? <div className="mt-2 text-sm text-slate-300">{children}</div> : null}
          <div className="mt-6 flex justify-center gap-3">
            {action ?? (
              <Link
                href="/dashboard/lessons"
                className="rounded-xl bg-accent-500 px-5 py-2.5 text-sm font-semibold text-brand-900 hover:bg-accent-400"
              >
                Back to my lessons
              </Link>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Countdown({ target }) {
  const [remaining, setRemaining] = useState(() => target - Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      const next = target - Date.now();
      setRemaining(next);
      // The room has opened — re-run the server check.
      if (next <= 0) window.location.reload();
    }, 1000);
    return () => clearInterval(timer);
  }, [target]);

  const total = Math.max(0, Math.floor(remaining / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

/** Media + signalling, mounted only once access has been granted. */
function RoomExperience({ roomId, room }) {
  const timezone = useViewerTimezone();
  const [phase, setPhase] = useState("lobby"); // lobby → call → left
  const media = useLocalMedia();
  const rtc = useVideoRoom({
    roomId,
    active: phase === "call",
    audioTrack: media.audioTrack,
    videoTrack: media.outgoingVideoTrack,
    micOn: media.micOn,
    camOn: media.camOn,
    sharing: media.sharing,
  });

  const when = fmtDateTime(room.lesson.startUTC, timezone, { withZone: true });

  // Warn before an accidental tab close during a live class.
  useEffect(() => {
    if (phase !== "call") return;
    const guard = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [phase]);

  if (phase === "left") {
    return (
      <Notice
        icon={PhoneOff}
        title="You left the class"
        action={
          <>
            <button
              type="button"
              onClick={() => {
                media.restart();
                setPhase("lobby");
              }}
              className="rounded-xl bg-accent-500 px-5 py-2.5 text-sm font-semibold text-brand-900 hover:bg-accent-400"
            >
              Rejoin
            </button>
            <Link
              href="/dashboard/lessons"
              className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
            >
              My lessons
            </Link>
          </>
        }
      >
        <p>The classroom stays open until an hour after the lesson ends.</p>
      </Notice>
    );
  }

  return (
    <Shell>
      {rtc.joinError ? (
        <p className="bg-red-500/20 px-5 py-2 text-center text-sm text-red-100">
          {rtc.joinError}
        </p>
      ) : null}
      {phase === "call" && rtc.hasTurn === false ? (
        <p className="bg-yellow-500/15 px-5 py-2 text-center text-xs text-yellow-100">
          No relay server is configured — if the video does not connect, one of you is likely
          behind a restrictive firewall.
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col">
        {phase === "lobby" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <PreJoin media={media} room={room} when={when} onJoin={() => setPhase("call")} />
          </div>
        ) : (
          <CallStage
            roomId={roomId}
            room={room}
            media={media}
            rtc={rtc}
            onLeave={() => {
              media.stopAll();
              setPhase("left");
            }}
          />
        )}
      </div>
    </Shell>
  );
}

export default function ClassRoom({ roomId }) {
  const timezone = useViewerTimezone();
  const room = useQuery(api.video.room, { roomId });
  const [supported, setSupported] = useState(null);

  useEffect(() => {
    setSupported(isSupported() && isSecureContextOk());
  }, []);

  if (room === undefined || supported === null) {
    return (
      <Shell>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-slate-500" />
        </div>
      </Shell>
    );
  }

  if (!supported) {
    return (
      <Notice title="This browser can't run the classroom">
        <p>
          Video classes need a modern browser on a secure (https) connection. Please use the
          latest Chrome, Edge, Firefox or Safari.
        </p>
      </Notice>
    );
  }

  switch (room.status) {
    case "ok":
      return <RoomExperience roomId={roomId} room={room} />;
    case "unauthenticated":
      return (
        <Notice
          title="Please sign in"
          action={
            <Link
              href="/login"
              className="rounded-xl bg-accent-500 px-5 py-2.5 text-sm font-semibold text-brand-900 hover:bg-accent-400"
            >
              Sign in
            </Link>
          }
        >
          <p>Sign in with the account this class was booked with to join.</p>
        </Notice>
      );
    case "forbidden":
      return (
        <Notice title="This class isn't yours">
          <p>
            You are signed in with an account that is not part of this lesson. Switch accounts
            and open the link again.
          </p>
        </Notice>
      );
    case "cancelled":
      return (
        <Notice title="This lesson was cancelled">
          <p>The classroom for a cancelled lesson is closed. Book a new time from your lessons page.</p>
        </Notice>
      );
    case "early":
      return (
        <Notice icon={CalendarClock} title="You're early — the room isn't open yet">
          <p>
            This class starts at{" "}
            {fmtDateTime(room.lesson.startUTC, timezone, { withZone: true })}. The room
            opens 15 minutes before, in <Countdown target={room.opensAt} />.
          </p>
        </Notice>
      );
    case "ended":
      return (
        <Notice title="This class has ended">
          <p>The classroom closes an hour after the lesson ends.</p>
        </Notice>
      );
    default:
      return (
        <Notice title="This class link is not valid">
          <p>Double-check the link, or open the class from your lessons page.</p>
        </Notice>
      );
  }
}
