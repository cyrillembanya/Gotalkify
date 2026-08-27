"use client";

import { useEffect, useState } from "react";
import { Mic, MicOff, Video, VideoOff, Loader2, ShieldCheck } from "lucide-react";
import VideoTile from "./VideoTile";
import { createLevelMeter } from "./media";

function DeviceSelect({ label, value, options, onChange, disabled }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      <select
        className="w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:border-accent-500 focus:outline-none disabled:opacity-50"
        value={value}
        disabled={disabled || options.length === 0}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.length === 0 ? <option value="">No device found</option> : null}
        {options.map((device) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The lobby: check yourself, pick devices, then enter the classroom. */
export default function PreJoin({ media, room, when, onJoin }) {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!media.audioTrack || !media.micOn || typeof MediaStream === "undefined") {
      setLevel(0);
      return;
    }
    return createLevelMeter(new MediaStream([media.audioTrack]), setLevel);
  }, [media.audioTrack, media.micOn]);

  const bars = 12;
  const litBars = Math.round(level * bars);

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 px-5 py-10 lg:grid-cols-[1.4fr_1fr] lg:items-center">
      <div>
        <div className="relative aspect-video w-full">
          <VideoTile
            stream={media.previewStream}
            name={room.me.name}
            muted
            mirrored
            showVideo={media.camOn && !!media.cameraTrack}
            micOn={media.micOn}
            status={media.camOn ? null : "Camera is off"}
            className="h-full w-full"
          />
          <div className="absolute inset-x-0 bottom-4 flex justify-center gap-3">
            <button
              type="button"
              onClick={media.toggleMic}
              aria-label={media.micOn ? "Mute microphone" : "Unmute microphone"}
              className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                media.micOn
                  ? "bg-white/15 text-white hover:bg-white/25"
                  : "bg-red-600 text-white hover:bg-red-700"
              }`}
            >
              {media.micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={media.toggleCam}
              aria-label={media.camOn ? "Turn camera off" : "Turn camera on"}
              className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                media.camOn
                  ? "bg-white/15 text-white hover:bg-white/25"
                  : "bg-red-600 text-white hover:bg-red-700"
              }`}
            >
              {media.camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Mic className="h-4 w-4 shrink-0 text-slate-400" />
          <div className="flex flex-1 gap-1" aria-hidden="true">
            {Array.from({ length: bars }, (_, index) => (
              <span
                key={index}
                className={`h-2 flex-1 rounded-full transition-colors ${
                  index < litBars ? "bg-accent-400" : "bg-white/10"
                }`}
              />
            ))}
          </div>
          <span className="w-28 shrink-0 text-right text-xs text-slate-400">
            {media.micOn ? "Say something" : "Microphone off"}
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-300">
          {room.lesson.type === "trial" ? "Trial lesson" : "Lesson"}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-white">
          {room.me.role === "tutor" ? room.studentName : room.tutorName}
        </h1>
        <p className="mt-1 text-sm text-slate-300">{when}</p>

        {media.error ? (
          <p className="mt-4 rounded-xl bg-red-500/15 px-4 py-3 text-sm text-red-200">
            {media.error}
          </p>
        ) : null}
        {media.notice ? (
          <p className="mt-4 rounded-xl bg-yellow-500/15 px-4 py-3 text-sm text-yellow-100">
            {media.notice}
          </p>
        ) : null}

        <div className="mt-5 space-y-3">
          <DeviceSelect
            label="Microphone"
            value={media.selected.mic}
            options={media.devices.microphones}
            onChange={(id) => media.selectDevice("mic", id)}
          />
          <DeviceSelect
            label="Camera"
            value={media.selected.camera}
            options={media.devices.cameras}
            onChange={(id) => media.selectDevice("camera", id)}
          />
          {media.devices.speakers.length > 0 ? (
            <DeviceSelect
              label="Speaker"
              value={media.selected.speaker}
              options={media.devices.speakers}
              onChange={(id) => media.selectDevice("speaker", id)}
            />
          ) : null}
        </div>

        <button
          type="button"
          onClick={onJoin}
          disabled={media.starting}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-accent-500 px-6 py-3 text-base font-semibold text-brand-900 transition-colors hover:bg-accent-400 disabled:opacity-60"
        >
          {media.starting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          {media.starting ? "Preparing…" : "Join the class"}
        </button>

        <p className="mt-4 flex items-start gap-2 text-xs text-slate-400">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          Your class is peer-to-peer and end-to-end encrypted between you and
          {room.me.role === "tutor" ? " your student" : " your tutor"}.
        </p>
      </div>
    </div>
  );
}
