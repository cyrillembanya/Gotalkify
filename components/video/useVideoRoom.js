"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PeerMesh } from "./mesh";

const HEARTBEAT_MS = 5000;
/** Must match PEER_TTL_MS in convex/video.js. */
const PEER_TTL_MS = 30_000;

const STUN_ONLY = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

/** `?relay=1` forces every connection through TURN, to verify the relay. */
function relayForced() {
  try {
    return new URLSearchParams(window.location.search).get("relay") === "1";
  } catch {
    return false;
  }
}

function randomPeerId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Joins the signalling room and keeps a WebRTC mesh in sync with its roster.
 *
 * The caller owns the local media (so the lobby can preview it before the
 * room is ever touched) and simply hands the current tracks down here.
 */
export function useVideoRoom({ roomId, active, audioTrack, videoTrack, micOn, camOn, sharing }) {
  const [peerId] = useState(randomPeerId);
  const [ice, setIce] = useState(null);
  const [remotes, setRemotes] = useState([]);
  const [joinError, setJoinError] = useState(null);
  const [entered, setEntered] = useState(false); // the join mutation has landed
  const [meshEpoch, setMeshEpoch] = useState(0); // bumped whenever a mesh is (re)built

  const iceServersAction = useAction(api.turn.iceServers);
  const joinRoom = useMutation(api.video.join);
  const heartbeat = useMutation(api.video.heartbeat);
  const leaveRoom = useMutation(api.video.leave);
  const sendSignal = useMutation(api.video.signal);
  const ackSignals = useMutation(api.video.ack);

  const meshRef = useRef(null);
  const seenSignals = useRef(new Set());
  const signalQueue = useRef(Promise.resolve());
  const flags = useRef({ micOn, camOn, sharing });
  flags.current = { micOn, camOn, sharing };

  /* ------------------------------- ICE servers -------------------------------- */

  useEffect(() => {
    if (!active || ice) return;
    let cancelled = false;
    iceServersAction()
      .then((result) => {
        if (!cancelled) setIce(result);
      })
      .catch(() => {
        // STUN-only still connects the large majority of peers.
        if (!cancelled) setIce({ iceServers: STUN_ONLY, hasTurn: false });
      });
    return () => {
      cancelled = true;
    };
  }, [active, ice, iceServersAction]);

  /* ------------------------------ join + presence ------------------------------ */

  // Nothing may be signalled before our own participant row exists, otherwise
  // the server rejects the message and the first offer is silently lost.
  const joined = active && !!ice && entered && !joinError;

  useEffect(() => {
    if (!active || !ice) return;
    let alive = true;

    joinRoom({ roomId, peerId, micOn: flags.current.micOn, camOn: flags.current.camOn })
      .then(() => {
        if (alive) setEntered(true);
      })
      .catch((error) => {
        if (alive) setJoinError(cleanMessage(error));
      });

    const timer = setInterval(() => {
      heartbeat({
        roomId,
        peerId,
        micOn: flags.current.micOn,
        camOn: flags.current.camOn,
        sharing: flags.current.sharing,
      }).catch(() => {});
    }, HEARTBEAT_MS);

    const goodbye = () => {
      meshRef.current?.close();
      leaveRoom({ roomId, peerId }).catch(() => {});
    };
    window.addEventListener("pagehide", goodbye);

    return () => {
      alive = false;
      setEntered(false);
      clearInterval(timer);
      window.removeEventListener("pagehide", goodbye);
      goodbye();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ice, roomId, peerId]);

  // Push mic / camera / presenting changes out immediately instead of waiting
  // for the next heartbeat, so the other side's indicators track reality.
  useEffect(() => {
    if (!joined) return;
    heartbeat({ roomId, peerId, micOn, camOn, sharing }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined, micOn, camOn, sharing]);

  /* ---------------------------------- the mesh --------------------------------- */

  // A dropped offer would stall the handshake, so retry transient failures a
  // couple of times; the mesh watchdog re-offers if it still does not land.
  const send = useCallback(
    ({ to, kind, payload }) => {
      const attempt = (remaining) =>
        sendSignal({ roomId, fromPeer: peerId, toPeer: to, kind, payload }).catch(() => {
          if (remaining > 0) setTimeout(() => attempt(remaining - 1), 600);
        });
      attempt(2);
    },
    [sendSignal, roomId, peerId]
  );

  useEffect(() => {
    if (!joined || meshRef.current) return;
    const mesh = new PeerMesh({
      selfId: peerId,
      iceServers: ice.iceServers,
      send,
      onUpdate: () => setRemotes(mesh.snapshot()),
      forceRelay: relayForced(),
    });
    mesh.setLocalTracks({ audio: audioTrack ?? null, video: videoTrack ?? null });
    meshRef.current = mesh;
    setMeshEpoch((n) => n + 1);
    return () => {
      mesh.close();
      meshRef.current = null;
      setRemotes([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined, ice, peerId, send]);

  useEffect(() => {
    meshRef.current?.setLocalTracks({ audio: audioTrack ?? null });
  }, [audioTrack]);

  useEffect(() => {
    meshRef.current?.setLocalTracks({ video: videoTrack ?? null });
  }, [videoTrack]);

  /* --------------------------------- the roster -------------------------------- */

  const rosterRows = useQuery(api.video.peers, joined ? { roomId } : "skip");

  const roster = useMemo(() => {
    if (!rosterRows) return [];
    // Staleness is measured against the freshest heartbeat rather than the
    // local clock, so a wrong clock on this device cannot evict anybody.
    const serverNow = rosterRows.reduce((max, r) => Math.max(max, r.lastSeenAt), 0);
    return rosterRows.filter((r) => serverNow - r.lastSeenAt < PEER_TTL_MS);
  }, [rosterRows]);

  const remoteIdKey = roster
    .map((r) => r.peerId)
    .filter((id) => id !== peerId)
    .sort()
    .join(",");

  useEffect(() => {
    if (!meshRef.current) return;
    meshRef.current.sync(remoteIdKey ? remoteIdKey.split(",") : []);
  }, [remoteIdKey, meshEpoch]);

  /* -------------------------------- signal inbox ------------------------------- */

  const inbox = useQuery(api.video.inbox, joined ? { roomId, peerId } : "skip");

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !inbox?.length) return;
    const fresh = inbox.filter((signal) => !seenSignals.current.has(signal._id));
    if (fresh.length === 0) return;
    fresh.forEach((signal) => seenSignals.current.add(signal._id));

    // Strictly sequential: SDP exchanges are order-sensitive.
    signalQueue.current = signalQueue.current
      .then(async () => {
        for (const signal of fresh) await mesh.receive(signal);
        await ackSignals({ roomId, ids: fresh.map((s) => s._id) }).catch(() => {});
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inbox, meshEpoch]);

  /* --------------------------------- UI model ---------------------------------- */

  const participants = useMemo(() => {
    const byPeer = new Map(remotes.map((r) => [r.peerId, r]));
    return roster
      .filter((r) => r.peerId !== peerId)
      .map((r) => ({
        ...r,
        ...(byPeer.get(r.peerId) ?? {
          stream: null,
          connectionState: "new",
          hasVideo: false,
          stats: {},
        }),
      }));
  }, [roster, remotes, peerId]);

  const quality = useMemo(() => {
    const stats = participants.map((p) => p.stats).filter((s) => s?.rtt != null);
    if (stats.length === 0) return null;
    const rtt = Math.max(...stats.map((s) => s.rtt));
    const loss = Math.max(...stats.map((s) => s.loss ?? 0));
    const relay = stats.some((s) => s.relay);
    const level = rtt > 400 || loss > 5 ? "poor" : rtt > 200 || loss > 2 ? "fair" : "good";
    return { rtt, loss, relay, level };
  }, [participants]);

  return {
    peerId,
    participants,
    connected: participants.some((p) => p.connectionState === "connected"),
    quality,
    hasTurn: ice?.hasTurn ?? null,
    joinError,
    ready: joined,
  };
}

function cleanMessage(error) {
  return (
    String(error?.message ?? error ?? "")
      .replace(/^.*Uncaught Error:\s*/, "")
      .split("\n")[0] || "Could not join the classroom."
  );
}
