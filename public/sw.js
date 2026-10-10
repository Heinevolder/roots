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

  // Pages: network first, but don't wait long on a bad connection: after 3 s show the last copy
  // (the list itself lives in IndexedDB) and let the network answer refresh the cache.
  if (req.mode === "navigate") {
    const network = fetch(req).then((res) => {
      if (res.ok && !res.redirected) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(url.pathname, copy));
      }
      return res;
    });
    const cached = async () => (await caches.match(url.pathname)) || (await caches.match("/liste"));
    const slow = new Promise((resolve) => setTimeout(resolve, 3000)).then(cached);
    event.respondWith(
      Promise.race([network.catch(() => undefined), slow])
        .then((res) => res || network)
        .catch(async () => (await cached()) || Response.error()),
    );
  }
});

// Push: "Anna har tilføjet …". Pushes merge into the one list notification instead of piling up.
const LIST_TAG = "roots-list";

function itemsText(items) {
  if (items.length <= 4) return items.length > 1 ? `${items.slice(0, -1).join(", ")} og ${items.at(-1)}` : items[0];
  return `${items.slice(0, 3).join(", ")} og ${items.length - 3} mere`;
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {}
  event.waitUntil(
    (async () => {
      if (data.kind !== "list") {
        return self.registration.showNotification(data.title || "Roots", { body: data.body, icon: "/icon-192.png", data: { url: data.url || "/liste" } });
      }
      const old = (await self.registration.getNotifications({ tag: LIST_TAG }))[0];
      const items = [...new Set([...(old?.data?.items ?? []), ...data.items])];
      const from = [...new Set([...(old?.data?.from ?? []), data.from || ""])];
      const title = from.length === 1 && from[0] ? `${from[0]} har tilføjet til listen` : "Nyt på indkøbslisten";
      return self.registration.showNotification(title, {
        body: itemsText(items),
        tag: LIST_TAG,
        renotify: true,
        icon: "/icon-192.png",
        data: { items, from, url: data.url || "/liste" },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/liste", location.origin).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const win = wins.find((w) => w.url.startsWith(location.origin));
      if (win) {
        await win.focus();
        if (win.url !== url) await win.navigate(url).catch(() => {});
      } else {
        await self.clients.openWindow(url);
      }
    })(),
  );
});
