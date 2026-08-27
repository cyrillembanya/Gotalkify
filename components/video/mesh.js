"use client";

/**
 * PeerMesh — a small, framework-free WebRTC mesh.
 *
 * One RTCPeerConnection per remote participant. Negotiation follows the W3C
 * "perfect negotiation" pattern so that both sides may offer at the same time
 * without deadlocking: the peer with the higher id is *polite* and rolls back
 * on a collision, the other one is *impolite* and ignores the colliding offer.
 *
 * Media is attached through two long-lived senders (one audio, one video) that
 * are created up front, so muting, switching camera and screen sharing are all
 * `replaceTrack()` calls and never trigger a renegotiation round trip.
 */

const PC_OPTIONS = {
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
  iceCandidatePoolSize: 2,
};

const DISCONNECT_GRACE_MS = 4000; // "disconnected" often self-heals
const MAX_ICE_RESTARTS = 4;
const STATS_INTERVAL_MS = 3000;
const WATCHDOG_INTERVAL_MS = 5000;
/** A handshake that has not completed in this long is assumed to have been lost. */
const HANDSHAKE_TIMEOUT_MS = 12_000;

export class PeerMesh {
  /**
   * @param {object} options
   * @param {string} options.selfId          this tab's peer id
   * @param {RTCIceServer[]} options.iceServers
   * @param {(msg: {to: string, kind: string, payload: string}) => void} options.send
   * @param {() => void} options.onUpdate    called whenever the UI model changes
   * @param {boolean} [options.forceRelay]   test mode: TURN only, no direct path
   */
  constructor({ selfId, iceServers, send, onUpdate, forceRelay = false }) {
    this.selfId = selfId;
    this.iceServers = iceServers;
    // Debug aid: `?relay=1` on the class URL routes every packet through TURN,
    // which is the only way to prove the relay works from an unrestricted network.
    this.forceRelay = forceRelay;
    this.send = send;
    this.onUpdate = onUpdate ?? (() => {});
    this.peers = new Map();
    this.localAudio = null;
    this.localVideo = null;
    this.closed = false;
    this.statsTimer = setInterval(() => this.collectStats(), STATS_INTERVAL_MS);
    this.watchdogTimer = setInterval(() => this.watchdog(), WATCHDOG_INTERVAL_MS);
  }

  /* --------------------------------- local media -------------------------------- */

  /** Attach (or detach, with `null`) the outgoing tracks on every connection. */
  setLocalTracks({ audio, video }) {
    if (audio !== undefined) this.localAudio = audio;
    if (video !== undefined) this.localVideo = video;
    for (const peer of this.peers.values()) {
      if (audio !== undefined) swapTrack(peer.audioSender, audio, "audio");
      if (video !== undefined) swapTrack(peer.videoSender, video, "video");
    }
  }

  /* ------------------------------- peer lifecycle ------------------------------- */

  /** Reconcile the mesh with the authoritative roster of remote peer ids. */
  sync(remoteIds) {
    if (this.closed) return;
    const wanted = new Set(remoteIds);
    for (const id of [...this.peers.keys()]) {
      if (!wanted.has(id)) this.destroyPeer(id, false);
    }
    for (const id of wanted) {
      if (id !== this.selfId && !this.peers.has(id)) this.createPeer(id);
    }
    this.onUpdate();
  }

  createPeer(remoteId) {
    const pc = new RTCPeerConnection({
      ...PC_OPTIONS,
      iceServers: this.iceServers,
      ...(this.forceRelay ? { iceTransportPolicy: "relay" } : {}),
    });
    const peer = {
      id: remoteId,
      pc,
      // Deterministic and opposite on the two sides — no coordination needed.
      polite: this.selfId > remoteId,
      makingOffer: false,
      ignoreOffer: false,
      settingRemoteAnswer: false,
      pendingCandidates: [],
      stream: new MediaStream(),
      connectionState: "new",
      iceRestarts: 0,
      disconnectTimer: null,
      stats: { rtt: null, loss: null, relay: false },
      createdAt: Date.now(),
      lastPoke: 0,
      lastRecover: 0,
    };
    this.peers.set(remoteId, peer);

    // Fixed m-line order on both sides: audio first, then video.
    peer.audioSender = pc.addTransceiver("audio", { direction: "sendrecv" }).sender;
    peer.videoSender = pc.addTransceiver("video", { direction: "sendrecv" }).sender;
    swapTrack(peer.audioSender, this.localAudio ?? null, "audio");
    swapTrack(peer.videoSender, this.localVideo ?? null, "video");

    pc.ontrack = ({ track }) => {
      // Keep one MediaStream per peer; replace same-kind tracks in place.
      for (const existing of peer.stream.getTracks()) {
        if (existing.kind === track.kind && existing.id !== track.id) {
          peer.stream.removeTrack(existing);
        }
      }
      if (!peer.stream.getTracks().some((t) => t.id === track.id)) {
        peer.stream.addTrack(track);
      }
      track.onunmute = () => this.onUpdate();
      track.onmute = () => this.onUpdate();
      track.onended = () => {
        peer.stream.removeTrack(track);
        this.onUpdate();
      };
      this.onUpdate();
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.send({ to: remoteId, kind: "candidate", payload: JSON.stringify(candidate) });
      }
    };

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await setLocalDescription(pc, "offer");
        this.send({
          to: remoteId,
          kind: "offer",
          payload: JSON.stringify(pc.localDescription),
        });
      } catch (error) {
        console.warn("[class] negotiation failed", error);
      } finally {
        peer.makingOffer = false;
      }
    };

    pc.onconnectionstatechange = () => {
      peer.connectionState = pc.connectionState;
      this.onUpdate();
      clearTimeout(peer.disconnectTimer);
      if (pc.connectionState === "failed") {
        this.recover(remoteId);
      } else if (pc.connectionState === "disconnected") {
        peer.disconnectTimer = setTimeout(() => {
          if (this.peers.get(remoteId) === peer && pc.connectionState === "disconnected") {
            this.recover(remoteId);
          }
        }, DISCONNECT_GRACE_MS);
      } else if (pc.connectionState === "connected") {
        peer.iceRestarts = 0;
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed") this.recover(remoteId);
    };

    return peer;
  }

  destroyPeer(remoteId, sayGoodbye = true) {
    const peer = this.peers.get(remoteId);
    if (!peer) return;
    this.peers.delete(remoteId);
    clearTimeout(peer.disconnectTimer);
    if (sayGoodbye) this.send({ to: remoteId, kind: "bye", payload: "{}" });
    try {
      peer.pc.ontrack = null;
      peer.pc.onicecandidate = null;
      peer.pc.onnegotiationneeded = null;
      peer.pc.onconnectionstatechange = null;
      peer.pc.oniceconnectionstatechange = null;
      peer.pc.close();
    } catch {
      /* already closed */
    }
  }

  /**
   * Connection trouble: try an ICE restart first (cheap, keeps the media
   * pipeline), then rebuild the connection from scratch. Only the impolite
   * side drives the restart; the polite side retries later if it is still
   * broken, which keeps the two peers from fighting each other.
   */
  recover(remoteId) {
    const peer = this.peers.get(remoteId);
    if (!peer || this.closed) return;
    // `connectionstatechange` and `iceconnectionstatechange` both fire on a
    // failure — only act on the first of the pair.
    if (Date.now() - peer.lastRecover < DISCONNECT_GRACE_MS) return;
    peer.lastRecover = Date.now();

    if (peer.iceRestarts >= MAX_ICE_RESTARTS) {
      this.destroyPeer(remoteId, false);
      this.createPeer(remoteId);
      this.onUpdate();
      return;
    }
    peer.iceRestarts += 1;
    const delay = peer.polite ? 5000 : 0;
    setTimeout(() => {
      const current = this.peers.get(remoteId);
      if (!current || current !== peer || this.closed) return;
      if (["connected", "closed"].includes(current.pc.connectionState)) return;
      try {
        current.pc.restartIce();
      } catch {
        // Older browsers: force a fresh offer with an ICE restart instead.
        current.pc
          .createOffer({ iceRestart: true })
          .then((offer) => current.pc.setLocalDescription(offer))
          .then(() =>
            this.send({
              to: remoteId,
              kind: "offer",
              payload: JSON.stringify(current.pc.localDescription),
            })
          )
          .catch(noop);
      }
    }, delay);
  }

  /**
   * Safety net for a signalling message that never arrived: if a peer is still
   * not connected long after it appeared, re-send the pending offer (or make a
   * fresh one). Only the impolite side creates new offers, so the two peers
   * cannot spiral into a renegotiation loop.
   */
  watchdog() {
    if (this.closed) return;
    const now = Date.now();
    for (const peer of this.peers.values()) {
      const { pc } = peer;
      if (pc.connectionState === "connected" || pc.connectionState === "closed") continue;
      if (now - peer.createdAt < HANDSHAKE_TIMEOUT_MS) continue;
      if (now - peer.lastPoke < HANDSHAKE_TIMEOUT_MS) continue;
      peer.lastPoke = now;

      if (pc.signalingState === "have-local-offer" && pc.localDescription) {
        // Our offer was never answered — send exactly the same one again.
        this.send({
          to: peer.id,
          kind: "offer",
          payload: JSON.stringify(pc.localDescription),
        });
      } else if (pc.signalingState === "stable" && !peer.polite) {
        (async () => {
          try {
            const offer = await pc.createOffer({ iceRestart: !!pc.remoteDescription });
            await pc.setLocalDescription(offer);
            this.send({
              to: peer.id,
              kind: "offer",
              payload: JSON.stringify(pc.localDescription),
            });
          } catch (error) {
            console.warn("[class] watchdog re-offer failed", error);
          }
        })();
      }
    }
  }

  /* --------------------------------- signalling --------------------------------- */

  async receive({ fromPeer, kind, payload }) {
    if (this.closed || fromPeer === this.selfId) return;
    if (kind === "bye") {
      this.destroyPeer(fromPeer, false);
      this.onUpdate();
      return;
    }
    const peer = this.peers.get(fromPeer) ?? this.createPeer(fromPeer);
    const { pc } = peer;

    try {
      if (kind === "offer" || kind === "answer") {
        const description = JSON.parse(payload);
        const readyForOffer =
          !peer.makingOffer &&
          (pc.signalingState === "stable" || peer.settingRemoteAnswer);
        const collision = description.type === "offer" && !readyForOffer;

        peer.ignoreOffer = !peer.polite && collision;
        if (peer.ignoreOffer) return;

        peer.settingRemoteAnswer = description.type === "answer";
        await pc.setRemoteDescription(description);
        peer.settingRemoteAnswer = false;

        for (const candidate of peer.pendingCandidates.splice(0)) {
          await pc.addIceCandidate(candidate).catch(noop);
        }
        if (description.type === "offer") {
          await setLocalDescription(pc, "answer");
          this.send({
            to: fromPeer,
            kind: "answer",
            payload: JSON.stringify(pc.localDescription),
          });
        }
      } else if (kind === "candidate") {
        const candidate = JSON.parse(payload);
        if (!candidate?.candidate) return;
        if (!pc.remoteDescription) peer.pendingCandidates.push(candidate);
        else await pc.addIceCandidate(candidate);
      }
    } catch (error) {
      if (!peer.ignoreOffer) console.warn("[class] signalling error", error);
    }
  }

  /* ----------------------------------- stats ------------------------------------ */

  async collectStats() {
    if (this.closed || this.peers.size === 0) return;
    let changed = false;
    for (const peer of this.peers.values()) {
      if (peer.pc.connectionState !== "connected") continue;
      try {
        const report = await peer.pc.getStats();
        let rtt = null;
        let relay = false;
        let received = 0;
        let lost = 0;
        report.forEach((stat) => {
          if (stat.type === "candidate-pair" && stat.state === "succeeded" && stat.nominated) {
            if (typeof stat.currentRoundTripTime === "number") {
              rtt = Math.round(stat.currentRoundTripTime * 1000);
            }
            const local = report.get(stat.localCandidateId);
            const remote = report.get(stat.remoteCandidateId);
            relay = local?.candidateType === "relay" || remote?.candidateType === "relay";
          }
          if (stat.type === "inbound-rtp" && !stat.isRemote) {
            received += stat.packetsReceived ?? 0;
            lost += stat.packetsLost ?? 0;
          }
        });
        const total = received + lost;
        const loss = total > 0 ? Math.round((lost / total) * 1000) / 10 : 0;
        if (peer.stats.rtt !== rtt || peer.stats.loss !== loss || peer.stats.relay !== relay) {
          peer.stats = { rtt, loss, relay };
          changed = true;
        }
      } catch {
        /* stats are best effort */
      }
    }
    if (changed) this.onUpdate();
  }

  /* ---------------------------------- snapshot ---------------------------------- */

  snapshot() {
    return [...this.peers.values()].map((peer) => ({
      peerId: peer.id,
      stream: peer.stream,
      connectionState: peer.connectionState,
      hasVideo: peer.stream.getVideoTracks().some((t) => !t.muted && t.readyState === "live"),
      hasAudio: peer.stream.getAudioTracks().length > 0,
      stats: peer.stats,
    }));
  }

  close() {
    this.closed = true;
    clearInterval(this.statsTimer);
    clearInterval(this.watchdogTimer);
    for (const id of [...this.peers.keys()]) this.destroyPeer(id, true);
  }
}

/* ---------------------------------- utilities ---------------------------------- */

function noop() {}

/**
 * `replaceTrack` is the no-renegotiation way to mute, switch camera or start
 * presenting. It is supported everywhere for same-kind swaps; if a browser
 * ever refuses, say so loudly rather than showing a frozen tile.
 */
function swapTrack(sender, track, kind) {
  if (!sender) return;
  sender.replaceTrack(track ?? null).catch((error) => {
    console.warn(`[class] could not swap the ${kind} track`, error);
  });
}

/**
 * `setLocalDescription()` with no argument is the race-free form, but fall
 * back to the explicit create* dance on browsers that do not implement it.
 */
async function setLocalDescription(pc, type) {
  try {
    await pc.setLocalDescription();
    return;
  } catch {
    /* fall through */
  }
  const description = type === "offer" ? await pc.createOffer() : await pc.createAnswer();
  await pc.setLocalDescription(description);
}
