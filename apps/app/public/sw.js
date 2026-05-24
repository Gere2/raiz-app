const CACHE_NAME = "raiz-y-grano-v2"
const OFFLINE_URL = "/offline"

const PRECACHE_URLS = [
  "/",
  "/offline",
  "/icon-192.png",
  "/icon-512.png",
  "/manifest.json",
]

// Install: precache essential resources
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch(() => {})
    })
  )
  self.skipWaiting()
})

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    )
  )
  self.clients.claim()
})

// Fetch: network first, fallback to cache, then offline page
self.addEventListener("fetch", (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET, API calls, Firebase, Stripe
  if (
    request.method !== "GET" ||
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("firestore") ||
    url.hostname.includes("firebase") ||
    url.hostname.includes("googleapis") ||
    url.hostname.includes("stripe") ||
    url.hostname.includes("gstatic")
  ) {
    return
  }

  // For navigation requests (HTML pages)
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful navigations
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          return response
        })
        .catch(() => {
          // Try cache, then offline page
          return caches.match(request).then((cached) => {
            return cached || caches.match(OFFLINE_URL) || new Response("Offline", { status: 503 })
          })
        })
    )
    return
  }

  // For assets (JS, CSS, images): stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        })
        .catch(() => cached)

      return cached || fetchPromise
    })
  )
})

// Push notifications
self.addEventListener("push", (event) => {
  const data = event.data?.json() || {}
  const title = data.title || "🔔 Raíz y Grano"
  const options = {
    body: data.body || "Your order is ready!",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || "order-update",
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: data.url || "/orders" },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// Notification click → open app
self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = event.notification.data?.url || "/"
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin)) {
          client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
