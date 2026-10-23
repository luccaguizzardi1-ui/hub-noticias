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
  "pdf.js",
];

// Lo del PDF (jsPDF 4.2.1, las 6 TTF y pdf.js) va en un caché propio que no se vuelve a bajar en
// cada versión de la app. Se llena al instalar sin trabar la instalación; si falla, se completa la
// primera vez que se arma un PDF con conexión.
const PDF = "pdf-4.2.1-f2";   // la "f" sube cada vez que se regeneran las TTF
const PDF_FIJOS = [
  "vendor/jspdf-4.2.1.umd.min.js",
  "fuentes/pdf/archivo-titulo.ttf", "fuentes/pdf/archivo-dato.ttf", "fuentes/pdf/archivo-apunte.ttf",
  "fuentes/pdf/alegreya.ttf", "fuentes/pdf/alegreya-negrita.ttf", "fuentes/pdf/alegreya-italica.ttf",
];
const PDF_ARCHIVOS = [...PDF_FIJOS, "pdf.js"];
const RUTAS_PDF = new Set(PDF_ARCHIVOS.map((u) => new URL(u, location).pathname));

async function llenarPdf() {
  const c = await caches.open(PDF);
  const faltan = [];
  for (const u of PDF_FIJOS) if (!(await c.match(u))) faltan.push(new Request(u, { cache: "reload" }));
  if (faltan.length) await c.addAll(faltan);
  await c.add(new Request("pdf.js", { cache: "reload" }));   // pdf.js cambia con la app: siempre el de esta versión
}

self.addEventListener("install", (ev) => {
  // cache: "reload" saltea la caché HTTP de GitHub Pages (10 min): la copia nueva nunca guarda archivos viejos.
  ev.waitUntil(Promise.all([
    caches.open(APP).then((c) => c.addAll(ARCHIVOS.map((u) => new Request(u, { cache: "reload" })))),
    llenarPdf().catch(() => {}),
  ]).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil((async () => {
    for (const nombre of await caches.keys()) {
      if (nombre.startsWith("app-") && nombre !== APP) await caches.delete(nombre);
      if (nombre.startsWith("pdf-") && nombre !== PDF) await caches.delete(nombre);
    }
    await self.clients.claim();
  })());
});

// La edición: primero la red (para tener la última). Si no hay conexión, o la red no contesta en
// 4 segundos (el subte), la guardada; la de la red, si llega después, queda guardada para la próxima.
const ESPERA_RED = 4000;
async function redPrimero(ev) {
  const req = ev.request;
  const cache = await caches.open(EDICION);
  const deRed = fetch(req, { cache: "no-store" }).then(async (r) => {
    if (r.ok) await cache.put(req, r.clone());
    return r;
  });
  ev.waitUntil(deRed.catch(() => {}));
  const guardada = await cache.match(req, { ignoreSearch: true });
  if (!guardada) return deRed;
  const tarde = new Promise((ok) => setTimeout(() => ok(null), ESPERA_RED));
  try {
    const r = await Promise.race([deRed, tarde]);
    return r && r.ok ? r : guardada;
  } catch {
    return guardada;
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

// Lo del PDF: primero el caché (pdf.js, el de la versión de la app que está andando), después la red,
// que queda guardada en el caché del PDF.
async function delPdf(req, url) {
  const c = await caches.open(PDF);
  const guardada = (url.pathname.endsWith("/pdf.js") && await (await caches.open(APP)).match(req, { ignoreSearch: true }))
    || await c.match(req, { ignoreSearch: true })
    || await caches.match(req, { ignoreSearch: true });
  if (guardada) return guardada;
  const r = await fetch(req);
  if (r.ok) await c.put(req, r.clone());
  return r;
}

self.addEventListener("fetch", (ev) => {
  const req = ev.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (/(edicion\.cifrada|version)\.json$/.test(url.pathname)) { ev.respondWith(redPrimero(ev)); return; }
    if (RUTAS_PDF.has(url.pathname)) { ev.respondWith(delPdf(req, url)); return; }
    ev.respondWith(caches.match(req, { ignoreSearch: true }).then((g) => g || fetch(req)));
    return;
  }
  if (req.destination === "image") ev.respondWith(foto(req).catch(() => Response.error()));
});

// Avisos de último momento (Web Push): los manda la tarea que arma la edición, después de publicarla.
self.addEventListener("push", (ev) => {
  let d = {};
  try { d = ev.data ? ev.data.json() : {}; } catch { d = { titulo: ev.data && ev.data.text() }; }
  ev.waitUntil(self.registration.showNotification(d.titulo || "el diario del pelado", {
    body: d.cuerpo || "Último momento",
    icon: "marca/icono-192.png",
    badge: "marca/icono-192.png",
    tag: d.nota || "aviso",           // el mismo hecho no se apila dos veces
    data: { nota: d.nota || "" },
  }));
});

// Tocar el aviso abre esa nota: en la app que ya está abierta o abriéndola.
self.addEventListener("notificationclick", (ev) => {
  ev.notification.close();
  const nota = (ev.notification.data && ev.notification.data.nota) || "";
  const destino = new URL(nota ? `./#nota=${encodeURIComponent(nota)}` : "./", self.registration.scope).href;
  ev.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const v of ventanas) {
      v.postMessage({ abrirNota: nota });
      if ("focus" in v) return v.focus();
    }
    return self.clients.openWindow(destino);
  })());
});
