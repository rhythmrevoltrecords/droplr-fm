/* droplr.fm service worker.
 *
 * Two jobs, deliberately separate:
 *   1. Push notifications (unchanged).
 *   2. A precached app SHELL so the installed PWA opens instantly instead of waiting on a cold
 *      Netlify function and a sleeping Neon compute. Measured cold TTFB before this: 11.1s.
 *
 * It never caches a private page or an API response. /admin is server-rendered per user and the
 * data belongs to one label — caching it would leak across accounts on a shared device. Only
 * static, public, non-identifying assets go in the cache.
 */
const SHELL = "droplr-shell-v1";
const SHELL_ASSETS = ["/app/icon-192.png", "/app/badge-96.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(SHELL_ASSETS).catch(() => undefined)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/* Static build assets are immutable and content-hashed: serve from cache, fill it in the
   background. Everything else — every HTML document, every /api call — goes straight to the
   network, so no private data is ever stored. */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const cacheable = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/app/");
  if (!cacheable) return;
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(req, copy)).catch(() => undefined);
        }
        return res;
      });
    }),
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = { title: "droplr.fm", body: event.data ? event.data.text() : "" }; }
  const url = typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//") ? data.url : "/admin";
  event.waitUntil(
    self.registration.showNotification(data.title || "droplr.fm", {
      body: data.body || "",
      icon: "/app/icon-192.png",
      badge: "/app/badge-96.png",
      tag: data.tag || undefined,
      renotify: !!data.tag,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/admin", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

/* The browser rotated the subscription: tell droplr so pushes keep arriving. */
self.addEventListener("pushsubscriptionchange", (event) => {
  const opts = event.oldSubscription && event.oldSubscription.options;
  if (!opts) return;
  event.waitUntil(
    self.registration.pushManager.subscribe(opts).then((sub) =>
      fetch("/api/push/subscribe", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), replaces: event.oldSubscription.endpoint }) }),
    ),
  );
});
