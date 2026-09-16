"use client";

import { useEffect, useState } from "react";

/**
 * `?email=` and `?next=` passed to the login / reset pages by the sign-up
 * forms when the address already has an account. Read from `window` rather
 * than `useSearchParams` so these statically rendered pages need no Suspense
 * boundary. `next` is only honoured for same-site paths.
 */
export function useAuthHandoff() {
  const [handoff, setHandoff] = useState({ email: "", next: "/dashboard" });
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next") ?? "";
    setHandoff({
      email: params.get("email") ?? "",
      next: next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard",
    });
  }, []);
  return handoff;
}
