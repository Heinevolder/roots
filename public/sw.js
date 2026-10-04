// Roots service worker: app shell offline, list data lives in IndexedDB.
const VERSION = "roots-v1";
const SHELL = ["/liste", "/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then(async (cache) => {
      for (const url of SHELL) {
        try {
          const res = await fetch(url, { credentials: "same-origin" });
          if (res.ok && !res.redirected) await cache.put(url, res);
        } catch {}
      }
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/list")) return; // sync goes to the network or fails

  // Hashed build assets never change.
  if (url.pathname.startsWith("/_next/static/") || /^\/(icon|apple-icon)/.test(url.pathname) || url.pathname.startsWith("/api/images/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Pages: network first, fall back to the last copy, then to the list.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(url.pathname)) || (await caches.match("/liste")) || Response.error()),
    );
  }
});
