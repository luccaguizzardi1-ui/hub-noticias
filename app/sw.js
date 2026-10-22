/* Service worker de el diario del pelado: la app abre sin conexión con la última edición.
   __VERSION_APP__ lo reemplaza motor/publicar.py con una huella de la app, así la copia
   guardada se renueva sólo cuando la app cambia. */
"use strict";

const VERSION = "__VERSION_APP__";
const APP = `app-${VERSION}`;
const EDICION = "edicion";
const FOTOS = "fotos";
const MAX_FOTOS = 80;
const ARCHIVOS = [
  "./", "index.html", "estilos.css", "app.js", "manifest.webmanifest",
  "marca/logo-calco-560.webp", "marca/apple-touch-icon.png", "marca/icono-192.png",
  "fuentes/archivo-normal-latin.woff2", "fuentes/archivo-normal-latin-ext.woff2",
  "fuentes/alegreya-normal-latin.woff2", "fuentes/alegreya-normal-latin-ext.woff2",
  "fuentes/alegreya-italic-latin.woff2",
];

self.addEventListener("install", (ev) => {
  ev.waitUntil(caches.open(APP).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil((async () => {
    for (const nombre of await caches.keys()) {
      if (nombre.startsWith("app-") && nombre !== APP) await caches.delete(nombre);
    }
    await self.clients.claim();
  })());
});

// La edición: primero la red (para tener la última); si no hay conexión, la guardada.
async function redPrimero(req) {
  const cache = await caches.open(EDICION);
  try {
    const r = await fetch(req, { cache: "no-store" });
    if (r.ok) await cache.put(req, r.clone());
    return r;
  } catch {
    const guardada = await cache.match(req, { ignoreSearch: true });
    if (guardada) return guardada;
    throw new Error("sin conexión y sin edición guardada");
  }
}

// Las fotos de las notas: las que ya se vieron quedan para leer sin conexión (las últimas 80).
async function foto(req) {
  const cache = await caches.open(FOTOS);
  const guardada = await cache.match(req);
  if (guardada) return guardada;
  const r = await fetch(req);
  if (r.ok || r.type === "opaque") {
    await cache.put(req, r.clone());
    const claves = await cache.keys();
    for (const vieja of claves.slice(0, Math.max(0, claves.length - MAX_FOTOS))) await cache.delete(vieja);
  }
  return r;
}

self.addEventListener("fetch", (ev) => {
  const req = ev.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (/(edicion\.cifrada|version)\.json$/.test(url.pathname)) { ev.respondWith(redPrimero(req)); return; }
    ev.respondWith(caches.match(req, { ignoreSearch: true }).then((g) => g || fetch(req)));
    return;
  }
  if (req.destination === "image") ev.respondWith(foto(req).catch(() => Response.error()));
});
