"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import { ViewerTimezoneProvider } from "@/lib/useViewerTimezone";

const convex = new ConvexReactClient(
  process.env.NEXT_PUBLIC_CONVEX_URL ?? "https://placeholder-000.convex.cloud",
  { verbose: false }
);

export default function Providers({ children }) {
  return (
    <ConvexAuthNextjsProvider client={convex}>
      <ViewerTimezoneProvider>{children}</ViewerTimezoneProvider>
    </ConvexAuthNextjsProvider>
  );
}
