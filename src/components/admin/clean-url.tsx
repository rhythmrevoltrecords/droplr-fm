"use client";
import { useEffect } from "react";

/** Once a one-off notice (?upgraded=1, ?canceled=1, ?plan=pro…) has rendered, drop the query string from the address bar. */
export function CleanUrl({ path }: { path: string }) {
  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, "", path);
  }, [path]);
  return null;
}
