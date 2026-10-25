// Service worker : l'application d'urgence doit s'ouvrir même sans réseau.
// Changer VERSION à chaque mise en ligne pour que les téléphones récupèrent les nouveaux fichiers.
const VERSION = 'dawa-v8';
const COQUE = [
  '/', '/index.html', '/app.js', '/i18n.js', '/secours.js', '/commun.js', '/villes.js', '/illustrations.js', '/guide.js',
  '/style.css', '/app.css', '/icone.svg', '/icone-192.png', '/icone-512.png', '/manifest.webmanifest', '/data/structures.json',
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

  // Fichiers de l'app : la copie du téléphone d'abord (instantané, même avec un réseau très lent),
  // puis mise à jour en arrière-plan pour la prochaine ouverture.
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const enCache = await cache.match(e.request, { ignoreSearch: true });
    const reseau = fetch(e.request)
      .then((res) => {
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      })
      .catch(() => null);
    if (enCache) {
      e.waitUntil(reseau);
      return enCache;
    }
    const res = await reseau;
    if (res) return res;
    return (e.request.mode === 'navigate' && (await cache.match('/'))) || Response.error();
  })());
});
