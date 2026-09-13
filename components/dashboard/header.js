"use client";

import { createContext, useContext, useEffect } from "react";

/**
 * Lets a page hand its title to the dashboard top bar, where it replaces the
 * logo on phones. The layout provides `setTitle`; `PageHeader` publishes.
 */
export const DashboardHeaderContext = createContext({ setTitle: () => {} });

export function usePublishTitle(title) {
  const { setTitle } = useContext(DashboardHeaderContext);
  useEffect(() => {
    setTitle(title);
    return () => setTitle(null);
  }, [title, setTitle]);
}
