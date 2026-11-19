const CACHE = "livingo-v2";

function asset(path) {
  return new URL(String(path).replace(/^\//, ""), self.registration.scope).href;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([asset(""), asset("manifest.webmanifest"), asset("icons/icon-192.png")]))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api") || event.request.method !== "GET") return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match(asset("index.html"))));
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && url.pathname.includes("/icons/")) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => undefined);
        }
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Livingo", body: event.data ? event.data.text() : "" };
  }
  const icon = asset("icons/icon-192.png");
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      const visible = windows.some((client) => client.visibilityState === "visible");
      if (visible) {
        for (const client of windows) {
          client.postMessage({ type: "push", title: payload.title, body: payload.body, url: payload.url });
        }
        return;
      }
      await self.registration.showNotification(payload.title || "Livingo", {
        body: payload.body || "",
        icon,
        badge: icon,
        data: { url: payload.url || asset("") },
      });
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || "";
  const url = raw.startsWith("http") ? raw : asset(raw || "");
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      const open = windows[0];
      if (open) {
        await open.focus();
        return;
      }
      await self.clients.openWindow(url);
    }),
  );
});
