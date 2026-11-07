"use client";

import { useEffect, useState } from "react";
import { useConvex } from "convex/react";
import { api } from "@/convex/_generated/api";

/**
 * Browser-clock → server-clock offset, shared by every hook instance on the
 * page so the lobby, the call stage and the hang-up all agree. `null` until
 * the first sync completes; the hook falls back to the raw browser clock
 * meanwhile so the UI never stalls.
 */
let offsetMs = null;
let syncing = null;
const listeners = new Set();

/** Round trips to make; the one with the lowest latency wins. */
const SAMPLES = 3;

async function sync(convex) {
  if (syncing) return syncing;
  syncing = (async () => {
    let best = null;
    for (let i = 0; i < SAMPLES; i++) {
      try {
        const sent = Date.now();
        const server = await convex.mutation(api.video.clock, {});
        const received = Date.now();
        const rtt = received - sent;
        // Assume the server stamped the time halfway through the round trip.
        const estimate = server - (sent + received) / 2;
        if (best === null || rtt < best.rtt) best = { rtt, estimate };
      } catch {
        // Offline or signed out: keep whatever we had (or the browser clock).
      }
    }
    if (best) {
      offsetMs = Math.round(best.estimate);
      for (const fn of listeners) fn();
    }
    syncing = null;
  })();
  return syncing;
}

/** `Date.now()` corrected to the server's clock (raw browser time before the first sync). */
export function serverNow() {
  return Date.now() + (offsetMs ?? 0);
}

/** The server-synchronised wall clock, ticking once a second. */
export function useNow() {
  const convex = useConvex();
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const tick = () => setNow(serverNow());
    listeners.add(tick);
    if (offsetMs === null) sync(convex).then(tick);
    const timer = setInterval(tick, 1000);
    return () => {
      clearInterval(timer);
      listeners.delete(tick);
    };
  }, [convex]);
  return now;
}
