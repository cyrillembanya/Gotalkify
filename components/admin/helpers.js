/** Shared helpers for the admin dashboard pages. */

/** Strip Convex error prefixes down to a readable one-line message. */
export function cleanError(err) {
  return String(err?.message ?? err)
    .replace(/^.*Uncaught Error:\s*/, "")
    .split("\n")[0];
}
