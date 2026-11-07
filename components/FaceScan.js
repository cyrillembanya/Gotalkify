"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, RefreshCw, ScanFace } from "lucide-react";

const MAX_WIDTH = 720; // plenty for an admin to compare against an ID photo

/**
 * Live face scan for tutor verification: opens the camera, guides the applicant
 * into the frame, counts down and grabs a still. The parent receives the frame
 * as a File through `onCapture(file, previewUrl)`.
 *
 * Deliberately camera-only — an uploaded photo would defeat the check.
 */
export default function FaceScan({ onCapture, preview, onRetake }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  // idle | starting | live | counting | error
  const [state, setState] = useState("idle");
  const [count, setCount] = useState(0);
  const [error, setError] = useState("");

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => stop, [stop]);

  async function start() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("error");
      setError(
        "This browser can't access a camera. Please open this page on a phone or laptop with a camera."
      );
      return;
    }
    setState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setState("live");
    } catch (err) {
      stop();
      setState("error");
      setError(
        err?.name === "NotAllowedError"
          ? "Camera access was blocked. Allow the camera for this site in your browser settings, then try again."
          : err?.name === "NotFoundError"
            ? "No camera found on this device."
            : "Could not start the camera. Please try again."
      );
    }
  }

  function grabFrame() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    // The preview is mirrored for comfort; the saved scan is not, so the admin
    // sees the face the same way round as the ID photo.
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  /** Rough "is anyone actually there" check — rejects a lens-cap dark frame. */
  function frameIsUsable(canvas) {
    try {
      const ctx = canvas.getContext("2d");
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let sum = 0;
      const step = 4 * 97; // sparse sample, ~1% of pixels
      let n = 0;
      for (let i = 0; i < data.length; i += step) {
        sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        n++;
      }
      return n === 0 || sum / n > 18;
    } catch {
      return true; // never block on a sampling failure
    }
  }

  async function capture() {
    setState("counting");
    for (let i = 3; i > 0; i--) {
      setCount(i);
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    setCount(0);
    const canvas = grabFrame();
    if (!canvas) {
      setState("live");
      setError("The camera isn't ready yet — give it a second and try again.");
      return;
    }
    if (!frameIsUsable(canvas)) {
      setState("live");
      setError("That frame was too dark. Find better lighting and try again.");
      return;
    }
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9)
    );
    if (!blob) {
      setState("live");
      setError("Could not capture the photo. Please try again.");
      return;
    }
    const file = new File([blob], "face-scan.jpg", { type: "image/jpeg" });
    stop();
    setState("idle");
    onCapture(file, URL.createObjectURL(blob));
  }

  if (preview) {
    return (
      <div className="space-y-3">
        <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-slate-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Your face scan" className="w-full" />
        </div>
        <div className="flex justify-center">
          <button
            type="button"
            className="btn-secondary px-4 py-2 text-sm"
            onClick={() => {
              setState("idle");
              setError("");
              onRetake();
            }}
          >
            <RefreshCw className="h-4 w-4" /> Retake scan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative mx-auto aspect-[4/3] w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-slate-900">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`h-full w-full -scale-x-100 object-cover ${
            state === "live" || state === "counting" ? "" : "opacity-0"
          }`}
        />
        {/* Face guide */}
        {state === "live" || state === "counting" ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[78%] w-[58%] rounded-[50%] border-2 border-dashed border-white/70" />
          </div>
        ) : null}
        {state === "counting" ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="text-6xl font-bold text-white drop-shadow-lg">
              {count || "📸"}
            </span>
          </div>
        ) : null}
        {state === "idle" || state === "starting" || state === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400">
            {state === "error" ? (
              <CameraOff className="h-10 w-10" strokeWidth={1.5} />
            ) : (
              <ScanFace className="h-10 w-10" strokeWidth={1.5} />
            )}
            <p className="text-sm">
              {state === "starting" ? "Starting camera…" : "Camera is off"}
            </p>
          </div>
        ) : null}
      </div>

      {error ? <p className="text-center text-sm text-red-600">{error}</p> : null}

      <div className="flex justify-center gap-2">
        {state === "live" ? (
          <>
            <button type="button" className="btn-primary px-5 py-2.5 text-sm" onClick={capture}>
              <Camera className="h-4 w-4" /> Capture face scan
            </button>
            <button
              type="button"
              className="btn-ghost px-4 py-2.5 text-sm"
              onClick={() => {
                stop();
                setState("idle");
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn-primary px-5 py-2.5 text-sm"
            disabled={state === "starting" || state === "counting"}
            onClick={start}
          >
            <Camera className="h-4 w-4" />
            {state === "error" ? "Try again" : state === "starting" ? "Starting…" : "Start camera"}
          </button>
        )}
      </div>
    </div>
  );
}
