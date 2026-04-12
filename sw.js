const SW_VERSION = '2026-03-16-02';
const CACHE_NAME = `pop-${SW_VERSION}`;

// sw.js — Prince of Prints offline boot (v1)
const CACHE = CACHE_NAME;

// Cache the core “app shell” so POP can boot with no service.
// Add/remove files here only if they exist at your site root.
const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js"
];

// Small offline HTML fallback (no extra file needed)
function offlinePage() {
  const html = `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Prince of Prints — Offline</title>
    <style>
      body{font-family:system-ui,Arial;margin:0;padding:22px;background:#0b1220;color:#e8eefc}
      .card{max-width:760px;margin:0 auto;background:#111a2b;border:1px solid #223055;border-radius:14px;padding:16px}
      h1{margin:0 0 10px;font-size:20px}
      p{margin:8px 0;line-height:1.4}
      code{background:#0b1220;border:1px solid #223055;padding:2px 6px;border-radius:8px}
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Offline</h1>
      <p>No service right now.</p>
      <p>If this job/sheet was opened once while online, it should still load.</p>
      <p>If it was never opened online yet, it can’t be fetched here.</p>
      <p>Tip: open POP online first to “warm up” the cache.</p>
    </div>
  </body>
  </html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Cache runtime POP assets (indexes, maps, images, thumbs) as they are used.
function isPopRuntime(pathname) {
  return (
    pathname.includes("/jobs/") &&
    (
      pathname.endsWith(".json") ||
      pathname.match(/\.(png|jpg|jpeg|webp|gif|svg)$/i)
    )
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Only handle same-origin
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);

    // 1) App shell: cache-first for fast offline boot
    if (SHELL.some(p => url.pathname.endsWith(p.replace("./",""))) || url.pathname === "/") {
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        return offlinePage();
      }
    }

    // 2) Runtime job assets: stale-while-revalidate
    if (isPopRuntime(url.pathname)) {
      const cached = await cache.match(req);

      const update = fetch(req)
        .then((fresh) => {
          cache.put(req, fresh.clone());
          return fresh;
        })
        .catch(() => null);

      if (cached) {
        // update in background
        event.waitUntil(update);
        return cached;
      }

      const fresh = await update;
      if (fresh) return fresh;

      // If we get here: offline + not cached yet
      if (req.mode === "navigate") return offlinePage();
      return new Response("Offline and not cached yet.", { status: 503 });
    }

    // 3) Everything else: try network, then fall back for navigations
    try {
      return await fetch(req);
    } catch {
      if (req.mode === "navigate") return offlinePage();
      return new Response("Offline.", { status: 503 });
    }
  })());
});
