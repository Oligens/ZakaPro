/* ============================================================
   ZakaPro — Service Worker
   · Cache hors-ligne : navigation réseau-d'abord,
     assets immuables cache-d'abord, reste stale-while-revalidate
   · Notifications Push en arrière-plan (alertes de livraison
     et paiements confirmés) — relayées par l'API du téléphone
   ============================================================ */

const CACHE_NAME = "zakapro-v1";
const PRECACHE_URLS = ["/", "/manifest.json", "/icons/icon.svg"];

/* ---------- Installation : précache du shell ---------- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

/* ---------- Activation : purge des anciens caches ---------- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

/* ---------- Interception des requêtes ---------- */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // polices, API externes…

  /* Navigation SPA : réseau d'abord, repli sur le shell en cache */
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  /* Assets immuables (hash Vite) : cache d'abord */
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  /* Le reste : stale-while-revalidate */
  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});

/* ---------- Notifications Push ----------
   Payload serveur attendu :
   { "title": "…", "body": "…", "url": "/#/deliveries", "urgent": true } */
self.addEventListener("push", (event) => {
  let data = {
    title: "ZakaPro",
    body: "Nouveau paiement reçu.",
    url: "/#/deliveries",
    tag: "zakapro-alerte",
    urgent: false,
  };
  try {
    if (event.data) data = Object.assign(data, event.data.json());
  } catch {
    /* payload non-JSON : valeurs par défaut */
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon.svg",
      badge: "/icons/icon.svg",
      tag: data.tag,
      renotify: true,
      requireInteraction: Boolean(data.urgent),
      vibrate: data.urgent ? [300, 150, 300, 150, 600] : [200, 100, 200],
      data: { url: data.url },
      actions: data.urgent ? [{ action: "ouvrir", title: "Voir la livraison" }] : [],
    })
  );
});

/* ---------- Clic notification : focus / ouverture ---------- */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
