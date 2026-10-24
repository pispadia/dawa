// Service worker : l'application d'urgence doit s'ouvrir même sans réseau.
// Changer VERSION à chaque mise en ligne pour que les téléphones récupèrent les nouveaux fichiers.
const VERSION = 'dawa-v3';
const COQUE = [
  '/', '/index.html', '/app.js', '/i18n.js', '/secours.js', '/commun.js', '/villes.js',
  '/style.css', '/app.css', '/icone.svg', '/manifest.webmanifest', '/data/structures.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(COQUE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // API : toujours le réseau (données fraîches), rien en cache.
  if (url.pathname.startsWith('/api/')) return;

  // Fichiers de l'app : réseau d'abord pour avoir la dernière version, cache si pas de réseau.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copie = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copie));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })
        .then((r) => r || (e.request.mode === 'navigate' ? caches.match('/') : Response.error()))),
  );
});
