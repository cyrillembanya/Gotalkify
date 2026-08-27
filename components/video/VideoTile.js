"use client";

import { useEffect, useRef } from "react";
import { MicOff, MonitorUp, WifiOff } from "lucide-react";
import { applySpeaker } from "./media";

function initials(name) {
  return (name ?? "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * One participant. The <video> element is never unmounted while the peer is
 * present — audio keeps flowing behind the avatar when the camera is off.
 */
export default function VideoTile({
  stream,
  name,
  subtitle,
  muted = false,
  mirrored = false,
  showVideo = true,
  micOn = true,
  sharing = false,
  status,
  speakerId,
  className = "",
}) {
  const videoRef = useRef(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    if (element.srcObject !== stream) element.srcObject = stream ?? null;
    if (stream) {
      const attempt = element.play();
      if (attempt?.catch) attempt.catch(() => {});
    }
  }, [stream]);

  useEffect(() => {
    if (!muted) applySpeaker(videoRef.current, speakerId);
  }, [speakerId, muted]);

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl bg-slate-900 ring-1 ring-white/10 ${className}`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={`h-full w-full ${sharing ? "object-contain" : "object-cover"} ${
          showVideo ? "" : "invisible"
        } ${mirrored && !sharing ? "-scale-x-100" : ""}`}
      />

      {!showVideo ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-600 text-2xl font-semibold text-white">
            {initials(name)}
          </div>
          {status ? <p className="text-sm text-slate-300">{status}</p> : null}
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent p-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-white">
            {!micOn ? <MicOff className="h-3.5 w-3.5 text-red-400" /> : null}
            {sharing ? <MonitorUp className="h-3.5 w-3.5 text-accent-300" /> : null}
            {name}
          </p>
          {subtitle ? <p className="truncate text-xs text-slate-300">{subtitle}</p> : null}
        </div>
      </div>

      {status && showVideo ? (
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
          <WifiOff className="h-3 w-3" /> {status}
        </div>
      ) : null}
    </div>
  );
}
