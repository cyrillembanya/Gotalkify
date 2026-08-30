/** Turn a Convex/network error into a single readable sentence. */
export function cleanError(error) {
  // ConvexError data survives production redaction — prefer it.
  if (typeof error?.data === "string" && error.data.trim()) {
    return error.data.trim();
  }
  const message = String(error?.message ?? error ?? "")
    .replace(/^.*Uncaught (ConvexError|Error):\s*/, "")
    .replace(/\[CONVEX [^\]]*\]\s*/g, "")
    .replace(/\[Request ID: [^\]]*\]\s*/g, "")
    .split("\n")[0]
    .trim();
  if (!message || message === "Server Error") {
    return "Something went wrong on our side. Please try again.";
  }
  return message;
}
