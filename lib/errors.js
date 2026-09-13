/** Turn a Convex/network error into a single readable sentence. */
export function cleanError(error) {
  // ConvexError data survives production redaction — prefer it.
  if (typeof error?.data === "string" && error.data.trim()) {
    return error.data.trim();
  }
  if (typeof error?.data?.message === "string" && error.data.message.trim()) {
    return error.data.message.trim();
  }
  const raw = String(error?.message ?? error ?? "");
  // Dev deployments wrap the real message: "[CONVEX M(x:y)] [Request ID: …]
  // Server Error\nUncaught Error: <message>\n  at …" — dig the message out.
  const uncaught = raw.match(/Uncaught (?:ConvexError|Error):\s*([^\n]*)/);
  const message = (uncaught ? uncaught[1] : raw)
    .replace(/\[CONVEX [^\]]*\]\s*/g, "")
    .replace(/\[Request ID: [^\]]*\]\s*/g, "")
    .split("\n")[0]
    .trim();
  if (!message || /^Server Error$/i.test(message)) {
    return "Something went wrong on our side. Please try again.";
  }
  return message;
}
