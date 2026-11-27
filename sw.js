/* Ofertas Firmat · service worker
   - Archivos de la app: primero la red (para ver siempre la última versión); sin conexión, la copia guardada.
   - Calles del mapa: primero la copia guardada (rápido y sin gastar datos), con un máximo de cuadritos.
   - Datos de Supabase (ofertas, cuentas): nunca se guardan acá; siempre van a la red. */
var VERSION = "v1";
var APP = "ofertas-app-" + VERSION;
var TILES = "ofertas-calles";
var MAX_TILES = 400;
var SHELL = [
  "/", "/index.html", "/styles.css", "/app.js", "/config.js", "/manifest.webmanifest",
  "/vendor/leaflet.js", "/vendor/leaflet.css", "/vendor/supabase.js",
  "/icons/icon-192.png", "/icons/icon-512.png", "/icons/favicon-64.png"
];
var TILE_HOSTS = ["tile.openstreetmap.org", "server.arcgisonline.com"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(APP).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf("ofertas-app-") === 0 && k !== APP; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function trimTiles() {
  return caches.open(TILES).then(function (c) {
    return c.keys().then(function (keys) {
      var extra = keys.length - MAX_TILES;
      return Promise.all(keys.slice(0, Math.max(0, extra)).map(function (k) { return c.delete(k); }));
    });
  });
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  // Calles del mapa
  if (TILE_HOSTS.some(function (h) { return url.hostname.endsWith(h); })) {
    e.respondWith(caches.open(TILES).then(function (c) {
      return c.match(req).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res.ok || res.type === "opaque") { c.put(req, res.clone()); trimTiles(); }
          return res;
        });
      });
    }));
    return;
  }

  // Archivos propios de la app (no los datos de Supabase ni otros sitios)
  if (url.origin !== self.location.origin) return;
  e.respondWith(fetch(req).then(function (res) {
    if (res.ok) { var copy = res.clone(); caches.open(APP).then(function (c) { c.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || (req.mode === "navigate" ? caches.match("/index.html") : Response.error());
    });
  }));
});
