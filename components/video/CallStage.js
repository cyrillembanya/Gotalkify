"use client";

import { useEffect, useState } from "react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  MonitorX,
  MessageSquare,
  PhoneOff,
  Settings,
  Signal,
  SignalLow,
  SignalMedium,
  Loader2,
} from "lucide-react";
import VideoTile from "./VideoTile";
import ChatPanel from "./ChatPanel";
import { canShareScreen } from "./media";

function ControlButton({ label, active, danger, onClick, disabled, children }) {
  const tone = danger
    ? "bg-red-600 text-white hover:bg-red-700"
    : active
      ? "bg-white/15 text-white hover:bg-white/25"
      : "bg-red-600 text-white hover:bg-red-700";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${tone}`}
    >
      {children}
    </button>
  );
}

function QualityPill({ quality, hasTurn }) {
  if (!quality) return null;
  const [Icon, tone, text] =
    quality.level === "good"
      ? [Signal, "text-green-400", "Good connection"]
      : quality.level === "fair"
        ? [SignalMedium, "text-yellow-300", "Unstable connection"]
        : [SignalLow, "text-red-400", "Poor connection"];
  return (
    <span
      className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200"
      title={`Round trip ${quality.rtt ?? "?"} ms · ${quality.loss ?? 0}% packet loss${
        quality.relay ? " · relayed" : ""
      }${hasTurn === false ? " · no TURN relay configured" : ""}`}
    >
      <Icon className={`h-3.5 w-3.5 ${tone}`} /> {text}
    </span>
  );
}

/** mm:ss since the call was joined. */
function useElapsed() {
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.floor((now - start) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function CallStage({ roomId, room, media, rtc, onLeave }) {
  const [chatOpen, setChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const elapsed = useElapsed();
  const otherLabel = room.me.role === "tutor" ? room.studentName : room.tutorName;

  // Keyboard shortcuts, ignored while typing.
  useEffect(() => {
    const onKey = (event) => {
      const tag = event.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || event.target?.isContentEditable) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "m" || event.key === "M") media.toggleMic();
      if (event.key === "v" || event.key === "V") media.toggleCam();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [media]);

  const remotes = rtc.participants;
  const gridClass =
    remotes.length <= 1
      ? "grid-cols-1"
      : remotes.length <= 3
        ? "grid-cols-1 sm:grid-cols-2"
        : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            {room.lesson.type === "trial" ? "Trial lesson" : "Lesson"} with {otherLabel}
          </p>
          <p className="text-xs text-slate-400">
            {elapsed} · {remotes.length + 1} in the room
          </p>
        </div>
        <div className="flex items-center gap-2">
          <QualityPill quality={rtc.quality} hasTurn={rtc.hasTurn} />
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <main className="relative min-h-0 min-w-0 flex-1 p-3 sm:p-4">
          {remotes.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
              <p className="text-base font-semibold text-white">
                Waiting for {otherLabel} to join…
              </p>
              <p className="max-w-sm text-sm text-slate-400">
                They will appear here as soon as they open the class link. You can keep this tab
                open.
              </p>
            </div>
          ) : (
            <div className={`grid h-full min-h-0 gap-3 ${gridClass}`}>
              {remotes.map((peer) => (
                <VideoTile
                  key={peer.peerId}
                  stream={peer.stream}
                  name={peer.name}
                  subtitle={peer.role === "tutor" ? "Tutor" : peer.role === "admin" ? "Support" : "Student"}
                  micOn={peer.micOn}
                  sharing={peer.sharing}
                  showVideo={peer.hasVideo}
                  speakerId={media.selected.speaker}
                  status={
                    peer.connectionState === "connected"
                      ? peer.camOn === false
                        ? "Camera off"
                        : null
                      : peer.connectionState === "failed"
                        ? "Reconnecting…"
                        : "Connecting…"
                  }
                  className="h-full min-h-0 w-full"
                />
              ))}
            </div>
          )}

          {/* Self view: picture-in-picture on top of the stage. */}
          <div className="absolute bottom-5 right-5 hidden h-28 w-44 sm:block lg:h-36 lg:w-56">
            <VideoTile
              stream={media.previewStream}
              name={`${room.me.name} (you)`}
              muted
              mirrored
              sharing={media.sharing}
              micOn={media.micOn}
              showVideo={!!media.previewStream}
              status={media.camOn ? null : "Camera off"}
              className="h-full w-full shadow-lg"
            />
          </div>
        </main>

        {chatOpen ? (
          <div className="absolute inset-0 z-20 md:static md:z-auto md:w-80 md:shrink-0">
            <ChatPanel
              roomId={roomId}
              myUserId={room.me.userId}
              onClose={() => setChatOpen(false)}
            />
          </div>
        ) : null}
      </div>

      {settingsOpen ? (
        <div className="shrink-0 border-t border-white/10 bg-slate-900 px-4 py-4 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Microphone", "mic", media.devices.microphones, media.selected.mic],
              ["Camera", "camera", media.devices.cameras, media.selected.camera],
              ["Speaker", "speaker", media.devices.speakers, media.selected.speaker],
            ].map(([label, kind, options, value]) => (
              <label key={kind} className="block">
                <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
                <select
                  className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:border-accent-500 focus:outline-none"
                  value={value}
                  onChange={(event) => media.selectDevice(kind, event.target.value)}
                >
                  {options.length === 0 ? <option value="">No device found</option> : null}
                  {options.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <footer className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-white/10 px-4 py-4 sm:gap-3">
        <ControlButton
          label={media.micOn ? "Mute (M)" : "Unmute (M)"}
          active={media.micOn}
          onClick={media.toggleMic}
        >
          {media.micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </ControlButton>

        <ControlButton
          label={media.camOn ? "Turn camera off (V)" : "Turn camera on (V)"}
          active={media.camOn}
          onClick={media.toggleCam}
        >
          {media.camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </ControlButton>

        {canShareScreen() ? (
          <ControlButton
            label={media.sharing ? "Stop presenting" : "Present your screen"}
            active
            onClick={media.sharing ? media.stopShare : media.startShare}
          >
            {media.sharing ? (
              <MonitorX className="h-5 w-5 text-accent-300" />
            ) : (
              <MonitorUp className="h-5 w-5" />
            )}
          </ControlButton>
        ) : null}

        <ControlButton
          label="Class chat"
          active
          onClick={() => setChatOpen((open) => !open)}
        >
          <MessageSquare className={`h-5 w-5 ${chatOpen ? "text-accent-300" : ""}`} />
        </ControlButton>

        <ControlButton
          label="Devices"
          active
          onClick={() => setSettingsOpen((open) => !open)}
        >
          <Settings className={`h-5 w-5 ${settingsOpen ? "text-accent-300" : ""}`} />
        </ControlButton>

        <button
          type="button"
          onClick={onLeave}
          className="ml-2 flex h-12 items-center gap-2 rounded-full bg-red-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-red-700"
        >
          <PhoneOff className="h-5 w-5" /> Leave
        </button>
      </footer>
    </div>
  );
}
