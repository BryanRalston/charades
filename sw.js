const CACHE = "charades-v8-7";
const ASSET_VERSION = "8.7";
const NETWORK_TIMEOUT_MS = 2500;
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./splash.png",
  "./prompts.js",
  "./assets/decks/bible-characters.webp",
  "./assets/decks/bible-stories.webp",
  "./assets/decks/miracles-parables.webp",
  "./assets/decks/christmas-easter.webp",
  "./assets/decks/church-life.webp",
  "./assets/decks/bible-animals.webp",
  "./assets/decks/bible-places-things.webp",
  "./assets/decks/hum-it.webp",
  "./assets/decks/actions.webp",
  "./assets/decks/jobs.webp",
  "./assets/decks/sports.webp",
  "./assets/decks/animals.webp",
  "./assets/decks/chores.webp",
  "./assets/decks/movies.webp",
  "./assets/decks/everyday-objects.webp",
  "./assets/decks/foods.webp",
  "./assets/decks/outdoor-fun.webp",
  "./assets/decks/mix.webp"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isNavigation(request, url) {
  if (request.mode === "navigate") return true;
  const path = url.pathname;
  return path.endsWith("/") || path.endsWith("/index.html");
}

/* network-timeout-start */
function networkFirst(request) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("timeout"));
    }, NETWORK_TIMEOUT_MS);
    fetch(request).then((response) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(response);
    }, (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}
/* network-timeout-end */

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isNavigation(request, url)) {
    event.respondWith(
      networkFirst(request)
        .then((response) => {
          if (response && response.ok && !response.redirected) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE);
          return (
            (await cache.match(request)) ||
            (await cache.match("./index.html")) ||
            (await cache.match("./")) ||
            new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } })
          );
        })
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response && response.ok && !response.redirected) {
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      } catch (err) {
        return cached || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
      }
    })
  );
});
