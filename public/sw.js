/* droplr.fm dashboard service worker: push notifications only (no offline caching of private pages). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

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
