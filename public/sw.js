// Service worker des notifications push (Web Push). Fichier JS statique,
// sans bundler/Workbox : le payload est déjà tout prêt côté serveur
// (src/lib/push-send.ts), ce service worker n'a qu'à l'afficher et gérer le
// clic. `skipWaiting`/`clients.claim` : prend effet immédiatement, pas besoin
// d'attendre la fermeture de tous les onglets (rien à mettre en cache ici).
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const { title, body, url, tag } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url;
  if (!url) return;

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = clientsList.find((c) => new URL(c.url).pathname === new URL(url, self.location.origin).pathname);
      if (existing) {
        await existing.focus();
      } else {
        await self.clients.openWindow(url);
      }
    })(),
  );
});
