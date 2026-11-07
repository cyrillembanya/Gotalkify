"use client";

/**
 * The timezone every displayed time in the app is rendered in.
 *
 * Resolution order:
 *  1. a zone the signed-in user picked by hand (never overridden),
 *  2. the zone detected from their browser,
 *  3. their saved zone, then UTC as a last resort.
 *
 * Detection runs in an effect rather than during render, so the server and the
 * first client render agree (no hydration mismatch) — and for signed-in users
 * the detected zone is written back once, which is what stops a fresh account
 * from showing UTC times forever.
 */

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { browserTimezone } from "@/lib/format";
import { safeZone } from "@/lib/tz";

const ViewerTimezoneContext = createContext(null);

const FALLBACK = { timezone: "UTC", detected: null, source: "fallback" };

export function ViewerTimezoneProvider({ children }) {
  const me = useQuery(api.users.me);
  const setTimezone = useMutation(api.users.setTimezone);
  const [detected, setDetected] = useState(null);

  useEffect(() => {
    setDetected(safeZone(browserTimezone()));
  }, []);

  const isManual = me?.timezoneSource === "manual";

  // Keep a signed-in user's saved zone in step with where they actually are,
  // unless they chose one by hand (someone abroad may want to stay on home
  // time). Failures are non-fatal — display already uses the detected zone.
  useEffect(() => {
    if (!me || !detected || isManual) return;
    if (me.timezone === detected && me.timezoneSource === "auto") return;
    setTimezone({ timezone: detected, auto: true }).catch(() => {});
  }, [me, detected, isManual, setTimezone]);

  const value = useMemo(() => {
    if (isManual) return { timezone: safeZone(me.timezone), detected, source: "manual" };
    if (detected) return { timezone: detected, detected, source: "detected" };
    if (me?.timezone) return { timezone: safeZone(me.timezone), detected, source: "saved" };
    return { ...FALLBACK, detected };
  }, [isManual, me, detected]);

  return (
    <ViewerTimezoneContext.Provider value={value}>
      {children}
    </ViewerTimezoneContext.Provider>
  );
}

/** The viewer's IANA timezone, e.g. "Europe/Paris". Always a usable string. */
export function useViewerTimezone() {
  return (useContext(ViewerTimezoneContext) ?? FALLBACK).timezone;
}

/** Full state — for the selector: { timezone, detected, source }. */
export function useViewerTimezoneDetails() {
  return useContext(ViewerTimezoneContext) ?? FALLBACK;
}
