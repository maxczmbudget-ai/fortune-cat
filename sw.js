// Offline support: the app shell is cached so it opens without a connection
// (showing the last data it fetched). Bump VERSION when you change app files.

const VERSION = 'fortunecat-v1';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/api.js', 'js/budget.js', 'js/tips.js', 'js/cat.js', 'js/demo.js',
  'icons/icon.svg', 'icons/icon-192.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.hostname.endsWith('google.com') || url.hostname.endsWith('googleusercontent.com')) return;

  // Same-origin files: network first so updates show up, cache as fallback.
  // Fonts and cat images: cache first.
  const cacheFirst = url.hostname.includes('fonts.') || url.pathname.includes('/cat/');
  e.respondWith(cacheFirst
    ? caches.match(e.request).then(hit => hit || fetchAndCache(e.request))
    : fetchAndCache(e.request).catch(() => caches.match(e.request, { ignoreSearch: true })));
});

function fetchAndCache(request) {
  return fetch(request).then(res => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(request, copy));
    }
    return res;
  });
}
