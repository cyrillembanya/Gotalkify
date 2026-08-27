"use client";

/** Camera / microphone plumbing shared by the lobby and the call. */

export function isSupported() {
  return (
    typeof window !== "undefined" &&
    typeof window.RTCPeerConnection === "function" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

export function canShareScreen() {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
}

/** WebRTC only works on https (or localhost). Worth telling people up front. */
export function isSecureContextOk() {
  if (typeof window === "undefined") return true;
  return window.isSecureContext || window.location.hostname === "localhost";
}

const VIDEO_CONSTRAINTS = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30, max: 30 },
  facingMode: "user",
};

const AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export function describeMediaError(error) {
  const name = error?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera and microphone access was blocked. Allow it in your browser's address bar, then try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera or microphone was found. Plug one in, or join with audio only.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "Your camera or microphone is already in use by another app. Close it (Zoom, Meet, Teams…) and try again.";
  }
  return error?.message || "Could not start your camera and microphone.";
}

/**
 * Ask for the requested devices, degrading rather than failing: if the camera
 * is unavailable we still return the microphone, and vice versa.
 */
export async function acquireStream({ audioDeviceId, videoDeviceId, wantAudio = true, wantVideo = true }) {
  const audio = wantAudio
    ? { ...AUDIO_CONSTRAINTS, ...(audioDeviceId ? { deviceId: { exact: audioDeviceId } } : {}) }
    : false;
  const video = wantVideo
    ? { ...VIDEO_CONSTRAINTS, ...(videoDeviceId ? { deviceId: { exact: videoDeviceId } } : {}) }
    : false;

  if (!audio && !video) return { stream: null, error: null, degraded: null };

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio, video });
    return { stream, error: null, degraded: null };
  } catch (error) {
    // An exact deviceId that has since been unplugged — retry with defaults.
    if (error?.name === "OverconstrainedError" && (audioDeviceId || videoDeviceId)) {
      return acquireStream({ wantAudio, wantVideo });
    }
    if (audio && video) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
        return { stream, error: null, degraded: "video" };
      } catch {
        /* fall through */
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
        return { stream, error: null, degraded: "audio" };
      } catch {
        /* fall through */
      }
    }
    return { stream: null, error, degraded: null };
  }
}

export async function listDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return { cameras: [], microphones: [], speakers: [] };
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  const pick = (kind) =>
    devices
      .filter((d) => d.kind === kind && d.deviceId)
      .map((d, index) => ({
        deviceId: d.deviceId,
        label: d.label || `${LABELS[kind]} ${index + 1}`,
      }));
  return {
    cameras: pick("videoinput"),
    microphones: pick("audioinput"),
    speakers: pick("audiooutput"),
  };
}

const LABELS = {
  videoinput: "Camera",
  audioinput: "Microphone",
  audiooutput: "Speaker",
};

/** Rough 0–1 loudness meter, used for the "is my mic working?" bar. */
export function createLevelMeter(stream, onLevel) {
  const AudioCtx = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioCtx || stream.getAudioTracks().length === 0) return () => {};
  let raf = 0;
  const context = new AudioCtx();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const buffer = new Uint8Array(analyser.frequencyBinCount);

  const tick = () => {
    analyser.getByteTimeDomainData(buffer);
    let peak = 0;
    for (const sample of buffer) peak = Math.max(peak, Math.abs(sample - 128) / 128);
    onLevel(Math.min(1, peak * 1.6));
    raf = requestAnimationFrame(tick);
  };
  tick();

  return () => {
    cancelAnimationFrame(raf);
    try {
      source.disconnect();
      context.close();
    } catch {
      /* already torn down */
    }
  };
}

export function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

/** Route playback to a chosen speaker where the browser allows it. */
export async function applySpeaker(element, deviceId) {
  if (!element || !deviceId || typeof element.setSinkId !== "function") return;
  try {
    await element.setSinkId(deviceId);
  } catch {
    /* unsupported or not permitted — keep the default output */
  }
}
