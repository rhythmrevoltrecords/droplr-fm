"use client";

import { useEffect } from "react";

/**
 * Registers the service worker for every signed-in dashboard visit.
 *
 * It used to register only when someone turned on push notifications, which meant almost nobody
 * had one — so the installed PWA opened with an empty cache and waited on a cold function every
 * time. Registering here precaches the static build assets, so the app's chrome paints from disk.
 *
 * It caches nothing private: see public/sw.js. Documents and /api responses always hit the network.
 */
export function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const id = window.setTimeout(() => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }, 1200); // after first paint: registration must never compete with the page it is speeding up
    return () => window.clearTimeout(id);
  }, []);
  return null;
}
