"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  acquireStream,
  canShareScreen,
  describeMediaError,
  listDevices,
} from "./media";

/**
 * Owns this tab's outgoing media: one microphone track, one camera track and
 * (while presenting) one screen track. Turning the camera off really stops
 * the device, so the hardware indicator light goes out; muting only disables
 * the audio track, which is instant and keeps the connection untouched.
 */
export function useLocalMedia() {
  const [audioTrack, setAudioTrack] = useState(null);
  const [cameraTrack, setCameraTrack] = useState(null);
  const [screenTrack, setScreenTrack] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [devices, setDevices] = useState({ cameras: [], microphones: [], speakers: [] });
  const [selected, setSelected] = useState({ mic: "", camera: "", speaker: "" });
  const [starting, setStarting] = useState(true);
  const [epoch, setEpoch] = useState(0); // bumped by restart() after leaving

  // Mirrors of the tracks so unmount cleanup never races with React state.
  const live = useRef({ audio: null, camera: null, screen: null });
  live.current = { audio: audioTrack, camera: cameraTrack, screen: screenTrack };

  const refreshDevices = useCallback(async () => {
    try {
      setDevices(await listDevices());
    } catch {
      /* enumeration is best effort */
    }
  }, []);

  /* --------------------------------- start up --------------------------------- */

  useEffect(() => {
    let cancelled = false;
    setStarting(true);
    (async () => {
      const { stream, error: mediaError, degraded } = await acquireStream({});
      if (cancelled) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }
      if (mediaError) {
        setError(describeMediaError(mediaError));
        setMicOn(false);
        setCamOn(false);
      } else {
        const audio = stream.getAudioTracks()[0] ?? null;
        const camera = stream.getVideoTracks()[0] ?? null;
        setAudioTrack(audio);
        setCameraTrack(camera);
        setMicOn(!!audio);
        setCamOn(!!camera);
        setSelected({
          mic: audio?.getSettings?.().deviceId ?? "",
          camera: camera?.getSettings?.().deviceId ?? "",
          speaker: "",
        });
        if (degraded === "video") setNotice("No camera available — you joined with audio only.");
        if (degraded === "audio") setNotice("No microphone available — others won't hear you.");
      }
      setStarting(false);
      await refreshDevices();
    })();

    return () => {
      cancelled = true;
      Object.values(live.current).forEach((track) => track?.stop());
    };
  }, [refreshDevices, epoch]);

  // Devices being plugged in or removed mid-call.
  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) return;
    navigator.mediaDevices.addEventListener("devicechange", refreshDevices);
    return () => navigator.mediaDevices.removeEventListener("devicechange", refreshDevices);
  }, [refreshDevices]);

  /* --------------------------------- controls --------------------------------- */

  const toggleMic = useCallback(async () => {
    if (audioTrack) {
      const next = !audioTrack.enabled;
      audioTrack.enabled = next;
      setMicOn(next);
      return;
    }
    // No microphone yet (permission was denied or it was released) — retry.
    const { stream, error: mediaError } = await acquireStream({
      wantVideo: false,
      audioDeviceId: selected.mic || undefined,
    });
    if (mediaError) return setError(describeMediaError(mediaError));
    setError(null);
    setAudioTrack(stream.getAudioTracks()[0] ?? null);
    setMicOn(true);
  }, [audioTrack, selected.mic]);

  const toggleCam = useCallback(async () => {
    if (cameraTrack) {
      cameraTrack.stop();
      setCameraTrack(null);
      setCamOn(false);
      return;
    }
    const { stream, error: mediaError } = await acquireStream({
      wantAudio: false,
      videoDeviceId: selected.camera || undefined,
    });
    if (mediaError) return setError(describeMediaError(mediaError));
    setError(null);
    setCameraTrack(stream.getVideoTracks()[0] ?? null);
    setCamOn(true);
  }, [cameraTrack, selected.camera]);

  const stopShare = useCallback(() => {
    setScreenTrack((current) => {
      current?.stop();
      return null;
    });
  }, []);

  const startShare = useCallback(async () => {
    if (!canShareScreen()) return;
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 30 } },
        audio: false,
      });
      const track = display.getVideoTracks()[0];
      if (!track) return;
      // Tell the encoder to favour sharpness over frame rate for slides/code.
      track.contentHint = "detail";
      // The browser's own "Stop sharing" bar ends the track directly.
      track.addEventListener("ended", () => setScreenTrack(null));
      setScreenTrack(track);
    } catch {
      /* the picker was dismissed */
    }
  }, []);

  const selectDevice = useCallback(
    async (kind, deviceId) => {
      setSelected((prev) => ({ ...prev, [kind]: deviceId }));
      if (kind === "speaker") return;

      if (kind === "mic") {
        const wasMuted = audioTrack ? !audioTrack.enabled : !micOn;
        const { stream, error: mediaError } = await acquireStream({
          wantVideo: false,
          audioDeviceId: deviceId,
        });
        if (mediaError) return setError(describeMediaError(mediaError));
        const next = stream.getAudioTracks()[0] ?? null;
        if (next) next.enabled = !wasMuted;
        audioTrack?.stop();
        setAudioTrack(next);
        setMicOn(!!next && !wasMuted);
        return;
      }

      if (!camOn) return; // the new camera starts when it is switched back on
      const { stream, error: mediaError } = await acquireStream({
        wantAudio: false,
        videoDeviceId: deviceId,
      });
      if (mediaError) return setError(describeMediaError(mediaError));
      cameraTrack?.stop();
      setCameraTrack(stream.getVideoTracks()[0] ?? null);
    },
    [audioTrack, cameraTrack, camOn, micOn]
  );

  const stopAll = useCallback(() => {
    Object.values(live.current).forEach((track) => track?.stop());
    setAudioTrack(null);
    setCameraTrack(null);
    setScreenTrack(null);
  }, []);

  /** Re-acquire the camera and microphone (used when rejoining after leaving). */
  const restart = useCallback(() => {
    setError(null);
    setNotice(null);
    setEpoch((n) => n + 1);
  }, []);

  /* ---------------------------------- outputs --------------------------------- */

  // What the local tile shows, and what is actually sent to the other side.
  const previewStream = useMemo(() => {
    const track = screenTrack ?? cameraTrack;
    if (!track || typeof MediaStream === "undefined") return null;
    return new MediaStream([track]);
  }, [screenTrack, cameraTrack]);

  return {
    audioTrack,
    cameraTrack,
    screenTrack,
    outgoingVideoTrack: screenTrack ?? cameraTrack ?? null,
    previewStream,
    micOn,
    camOn,
    sharing: !!screenTrack,
    starting,
    error,
    notice,
    devices,
    selected,
    toggleMic,
    toggleCam,
    startShare,
    stopShare,
    selectDevice,
    stopAll,
    restart,
    dismissNotice: () => setNotice(null),
  };
}
