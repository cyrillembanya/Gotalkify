"use node";

/**
 * ICE server configuration for the built-in classroom.
 *
 * STUN alone gets ~80-85% of peers connected directly. The rest sit behind
 * symmetric NAT or a corporate firewall and need a TURN relay — so configure
 * one of the providers below on the Convex deployment. Without TURN the
 * classroom still works for most people, and the UI warns when it is missing.
 *
 * Supported configurations (first match wins):
 *   1. Cloudflare Realtime TURN — CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN
 *   2. coturn with `use-auth-secret` — TURN_URLS + TURN_STATIC_AUTH_SECRET
 *   3. Static credentials (Metered, Twilio, self-hosted) — TURN_URLS +
 *      TURN_USERNAME + TURN_CREDENTIAL
 */

import { action } from "./_generated/server";
import crypto from "crypto";

const DEFAULT_STUN = [
  {
    urls: [
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
      "stun:stun.cloudflare.com:3478",
    ],
  },
];

const CREDENTIAL_TTL_SECONDS = 6 * 60 * 60;

function turnUrls() {
  return (process.env.TURN_URLS ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
}

/**
 * Cloudflare has shipped this under two paths; try the newer one first and
 * fall back, so a rename on their side cannot silently drop the relay.
 */
const CLOUDFLARE_PATHS = ["credentials/generate-ice-servers", "credentials/generate"];

async function cloudflareIce() {
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const token = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (!keyId || !token) return null;

  for (const path of CLOUDFLARE_PATHS) {
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/${path}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: CREDENTIAL_TTL_SECONDS }),
      }
    );
    if (res.status === 404) continue; // not this path — try the other one
    if (!res.ok) {
      console.error(
        `[turn] Cloudflare credentials failed ${res.status} on ${path}: ${await res.text()}`
      );
      return null;
    }
    const body = await res.json();
    const servers = body?.iceServers;
    if (!servers) {
      console.error(`[turn] Cloudflare returned no iceServers from ${path}`);
      return null;
    }
    return Array.isArray(servers) ? servers : [servers];
  }
  console.error("[turn] no Cloudflare credential endpoint responded — check the key id");
  return null;
}

/** coturn REST API: username is "<unix-expiry>:<label>", password is its HMAC-SHA1. */
function ephemeralIce() {
  const secret = process.env.TURN_STATIC_AUTH_SECRET;
  const urls = turnUrls();
  if (!secret || urls.length === 0) return null;
  const username = `${Math.floor(Date.now() / 1000) + CREDENTIAL_TTL_SECONDS}:gotalkify`;
  const credential = crypto
    .createHmac("sha1", secret)
    .update(username)
    .digest("base64");
  return [{ urls, username, credential }];
}

function staticIce() {
  const urls = turnUrls();
  const username = process.env.TURN_USERNAME;
  const credential = process.env.TURN_CREDENTIAL;
  if (urls.length === 0 || !username || !credential) return null;
  return [{ urls, username, credential }];
}

export const iceServers = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    let relays = null;
    try {
      relays = (await cloudflareIce()) ?? ephemeralIce() ?? staticIce();
    } catch (error) {
      console.error(`[turn] failed to build ICE configuration: ${error.message}`);
    }

    return {
      iceServers: [...DEFAULT_STUN, ...(relays ?? [])],
      hasTurn: !!relays,
      expiresAt: Date.now() + CREDENTIAL_TTL_SECONDS * 1000,
    };
  },
});
