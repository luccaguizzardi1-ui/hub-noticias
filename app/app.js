/* el diario del pelado: arma las hojas de la edición por secciones, el pliegue para
   pasarlas, la línea de recorrido, el índice, el lector y lo que guardás. Sin dependencias. */
"use strict";

const libro = document.getElementById("libro");
const recorrido = document.getElementById("recorrido");
const lector = document.getElementById("lector");
const aviso = document.getElementById("aviso");
const indice = document.getElementById("indice");
const indiceBoton = document.getElementById("indice-boton");
const panel = document.getElementById("guardadas");
const hojitaTarde = document.getElementById("mas-tarde");
const chipFiltro = document.getElementById("filtro");
const toast = document.getElementById("toast");

const estado = {
  edicion: null,
  medios: new Map(),
  notas: new Map(),
  secciones: [],  // las de la edición, ya filtradas por medio si hay filtro
  hojas: [],      // { el, seccion, notas: [ids] }
  actual: 0,
  modo: "",       // "telefono" | "tableta"
  orientacion: "",
  filtro: null,   // id de un medio: la edición sólo con ese medio
  leidas: new Set(),
  biblioteca: new Map(),  // notas guardadas, para más tarde y con marcas (en este equipo)
  respaldo: new Map(),    // las notas que abriste, por si salen de la biblioteca con el lector abierto
  temaDe: new Map(),      // id de nota -> ids de las notas que cuentan el mismo hecho (de varios medios)
  notaAbierta: null,
  ocupado: false,
};

const reducido = matchMedia("(prefers-reduced-motion: reduce)");
const horaFmt = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
const diaFmt = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" });
const ICONO = {
  flecha: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  externo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
};

/* ---------- memoria del lector (sólo en este dispositivo) ---------- */
function leerMemoria(clave, porDefecto) {
  try { const v = localStorage.getItem(clave); return v ? JSON.parse(v) : porDefecto; } catch { return porDefecto; }
}
function guardarMemoria(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* sin almacenamiento: no pasa nada */ }
}

/* ---------- utilidades ---------- */
function el(etiqueta, clase, texto) {
  const n = document.createElement(etiqueta);
  if (clase) n.className = clase;
  if (texto != null) n.textContent = texto;
  return n;
}
function hora(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const mismoDia = d.toDateString() === new Date().toDateString();
  return mismoDia ? horaFmt.format(d) : `${diaFmt.format(d).split(",")[0]} ${horaFmt.format(d)}`;
}
function largo(titulo) {
  const n = titulo.length;
  return n <= 60 ? "corto" : n <= 100 ? "medio" : "largo";
}
function colores(medio) {
  return `--c:${medio.linea.color};--t:${medio.linea.tinta}`;
}
function insignia(medio, clase = "insignia") {
  const s = el("span", clase, medio.linea.letra);
  s.style.cssText = colores(medio);
  s.setAttribute("aria-hidden", "true");
  return s;
}
function trozos(lista, patron) {
  // Reparte las notas en hojas siguiendo un patrón de plantillas que se repite.
  const hojas = [];
  let i = 0, p = 0;
  while (i < lista.length) {
    const [plantilla, cuantas] = patron[p % patron.length];
    hojas.push({ plantilla, ids: lista.slice(i, i + cuantas) });
    i += cuantas;
    p++;
  }
  return hojas;
}
let esperaToast = 0;
let deshacerToast = null, cierreToast = 0, pausado = false;
function anularDeshacer() {
  if (!deshacerToast) return;
  deshacerToast = null;
  toast.classList.remove("visible");
  toast.querySelector(".deshacer").hidden = true;
}
function programarCierre(ms) {
  clearTimeout(esperaToast);
  cierreToast = ms;
  esperaToast = setTimeout(() => {
    if (pausado) return;
    toast.classList.remove("visible");
    toast.querySelector(".deshacer").hidden = true;
    deshacerToast = null;
  }, ms);
}
// Avisos breves. Con «Deshacer» duran más y se pausan mientras los tocás o tienen el foco.
function avisar(texto, deshacer = null, { duracion = 0, detalle = "" } = {}) {
  toast.querySelector(".texto").textContent = texto;
  toast.querySelector(".detalle").textContent = detalle;
  const b = toast.querySelector(".deshacer");
  b.hidden = !deshacer;
  deshacerToast = deshacer;
  toast.classList.toggle("con-accion", Boolean(deshacer));
  toast.classList.add("visible");
  pausado = false;
  programarCierre(duracion || (deshacer ? 6000 : 2800));
}
toast.querySelector(".deshacer").addEventListener("click", async () => {
  const f = deshacerToast;
  deshacerToast = null;
  toast.classList.remove("visible");
  if (f) { await f(); avisar("Listo, como estaba"); }
});
for (const ev of ["pointerenter", "touchstart", "focusin"]) toast.addEventListener(ev, () => { pausado = true; clearTimeout(esperaToast); }, { passive: true });
for (const ev of ["pointerleave", "touchend", "focusout"]) {
  toast.addEventListener(ev, () => {
    setTimeout(() => {
      if (toast.contains(document.activeElement)) return;
      pausado = false;
      programarCierre(Math.max(2500, cierreToast / 2));
    }, 0);
  }, { passive: true });
}
function textoPlano(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const partes = [...doc.body.querySelectorAll("p, h2, h3, h4, li, blockquote, figcaption")]
    .filter((n) => !n.parentElement.closest("p, li, blockquote"))
    .map((n) => n.textContent.replace(/\s+/g, " ").trim()).filter(Boolean);
  return partes.length ? partes.join("\n\n") : doc.body.textContent.trim();
}

// Una nota y su medio, de la edición o de lo que guardaste (que puede ser de otra edición).
// Una nota puede no estar en la edición (la guardaste ayer): sale de tu biblioteca o del respaldo
// de lo que abriste, así guardar, marcar o compartir nunca se quedan sin la nota.
function notaPorId(id) {
  return estado.notas.get(id) || estado.biblioteca.get(id)?.nota || estado.respaldo.get(id)?.nota || null;
}
function medioDe(nota) {
  return estado.medios.get(nota.medio) || estado.biblioteca.get(nota.id)?.medio || estado.respaldo.get(nota.id)?.medio;
}

/* ---------- la biblioteca: guardadas, para más tarde y destacados (IndexedDB) ---------- */
let baseAbierta = null;
function abrirBase() {
  if (baseAbierta) return baseAbierta;
  baseAbierta = new Promise((ok, mal) => {
    const r = indexedDB.open("diario-del-pelado", 2);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("claves")) db.createObjectStore("claves");
      if (!db.objectStoreNames.contains("biblioteca")) db.createObjectStore("biblioteca", { keyPath: "id" });
    };
    r.onsuccess = () => {
      const db = r.result;
      db.onclose = () => { baseAbierta = null; };          // iOS la cierra al volver del fondo
      db.onversionchange = () => { db.close(); baseAbierta = null; };
      ok(db);
    };
    r.onerror = () => { baseAbierta = null; mal(r.error); };
  });
  return baseAbierta;
}
async function cargarBiblioteca() {
  try {
    const db = await abrirBase();
    const todos = await new Promise((ok, mal) => {
      const r = db.transaction("biblioteca").objectStore("biblioteca").getAll();
      r.onsuccess = () => ok(r.result || []);
      r.onerror = () => mal(r.error);
    });
    for (const r of todos) r.destacados = (r.destacados || []).map(normalizarMarca);
    estado.biblioteca = new Map(todos.map((x) => [x.id, x]));
    estado.sinBiblioteca = false;
  } catch {
    // No se pudo leer: no se escribe nada hasta poder leer, para no pisar lo guardado con una lista vacía.
    estado.biblioteca = new Map();
    estado.sinBiblioteca = true;
  }
}
async function persistir(registro) {
  if (estado.sinBiblioteca) {
    await cargarBiblioteca();
    if (estado.sinBiblioteca) { avisar("No pude leer lo que tenés guardado: no guardo nada para no pisarlo"); return false; }
    // Ya se pudo leer: el registro de memoria se mezcla con lo que había guardado de esa nota.
    const guardado = estado.biblioteca.get(registro.id);
    if (guardado && guardado !== registro) {
      const ids = new Set(registro.destacados.map((d) => d.id));
      registro.destacados.push(...guardado.destacados.filter((d) => !ids.has(d.id)));
      registro.guardada ||= guardado.guardada;
      registro.masTarde ||= guardado.masTarde;
    }
  }
  const vacio = !registro.guardada && !registro.masTarde && !registro.destacados.length;
  if (vacio) estado.biblioteca.delete(registro.id); else estado.biblioteca.set(registro.id, registro);
  try {
    const db = await abrirBase();
    await new Promise((ok, mal) => {
      const t = db.transaction("biblioteca", "readwrite");
      const almacen = t.objectStore("biblioteca");
      if (vacio) almacen.delete(registro.id); else almacen.put(registro);
      t.oncomplete = ok;
      t.onabort = t.onerror = () => mal(t.error);
    });
    return true;
  } catch {
    baseAbierta = null;
    avisar("No se pudo guardar en este equipo (puede estar lleno)");
    return false;
  }
}
function registroDe(id) {
  const existente = estado.biblioteca.get(id);
  if (existente) return existente;
  const nota = notaPorId(id);
  const m = medioDe(nota);
  return { id, nota, medio: { id: m.id, nombre: m.nombre, linea: m.linea }, guardada: null, masTarde: null, avisado: false, destacados: [] };
}

/* ---------- piezas ---------- */
// Las otras notas del mismo hecho, de otros medios, que están en esta edición.
function otrasVersiones(id) {
  const n = estado.notas.get(id);
  return (estado.temaDe.get(id) || []).filter((o) => o !== id && estado.notas.has(o) && estado.notas.get(o).medio !== n?.medio);
}
function nombresDeMedios(ids) {
  const nombres = [...new Set(ids.map((o) => estado.medios.get(estado.notas.get(o).medio).nombre))];
  return nombres.length > 1 ? `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}` : nombres[0];
}

function pieza(id, variante, { seccion = "", conOtras = false } = {}) {
  const n = estado.notas.get(id);
  const m = estado.medios.get(n.medio);
  const p = el("article", `pieza ${variante}`);
  p.dataset.largo = largo(n.titulo);
  p.dataset.nota = id;
  p.style.cssText = colores(m);
  if (n.foto && variante !== "chica") {
    const f = el("div", "foto");
    const img = el("img");
    img.src = n.foto;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => f.remove(), { once: true });
    f.append(img);
    p.append(f);
  } else {
    p.classList.add("sin-foto");
  }
  const t = el("div", "texto");
  t.append(el("h2", null, n.titulo));
  if (n.bajada && variante !== "chica") t.append(el("p", "bajada", n.bajada));
  const pie = el("p", "pie");
  const otras = conOtras ? otrasVersiones(id) : [];
  if (variante === "fila") {
    // En lo destacado de la tapa: la sección al pie (nunca arriba del título), el medio y cuántos más la cuentan.
    const cuantos = new Set(otras.map((o) => estado.notas.get(o).medio)).size;
    pie.append(el("b", "seccion", seccion), el("span", "gris",
      [m.nombre, hora(n.publicada || n.fecha), cuantos ? `y ${cuantos === 1 ? "otro medio" : `${cuantos} medios más`}` : ""].filter(Boolean).join(" · ")));
  } else {
    pie.append(insignia(m), document.createTextNode(m.nombre));
    const detalle = [hora(n.publicada || n.fecha), `${n.minutos} min`].filter(Boolean).join(" · ");
    pie.append(el("span", "gris", `· ${detalle}`));
    if (seccion) pie.append(el("span", "gris", `· ${seccion}`));
  }
  if (n.a_medias) pie.append(el("span", "medias", "· a medias"));
  t.append(pie);
  if (otras.length && variante !== "fila") t.append(el("p", "otras", `También la cuentan ${nombresDeMedios(otras)}`));
  p.append(t);
  const abrir = el("button", "abrir");
  abrir.type = "button";
  abrir.setAttribute("aria-label", `Leer: ${n.titulo} (${m.nombre})`);
  abrir.addEventListener("click", () => abrirNota(id));
  p.append(abrir);
  return p;
}

/* ---------- hojas ---------- */
function hojaBase(clases, etiqueta) {
  const h = el("section", `hoja ${clases}`);
  h.setAttribute("aria-label", etiqueta);
  h.hidden = true;
  return h;
}

function cartel() {
  const e = estado.edicion;
  const c = el("header", "cartel");
  const calco = el("img", "calco");
  calco.src = "marca/logo-calco-560.webp";
  calco.alt = "el diario del pelado";
  const datos = el("div", "datos");
  datos.append(el("p", "hora", `Edición de las ${horaFmt.format(new Date(e.generada))}`));
  datos.append(el("p", "dia", diaFmt.format(new Date(e.generada))));
  const elegido = estado.filtro && estado.medios.get(estado.filtro);
  datos.append(el("p", "cuenta", elegido
    ? `${e.notas.filter((n) => n.medio === elegido.id).length} notas de ${elegido.nombre}`
    : `${e.notas.length} notas de ${e.medios.length} medios`));
  const elegir = el("button", "elegir-medio");
  elegir.type = "button";
  elegir.setAttribute("aria-haspopup", "dialog");
  elegir.setAttribute("aria-controls", "medios");
  elegir.append(el("span", null, elegido ? `Sólo ${elegido.nombre}` : "Todos los medios"), flechita());
  elegir.addEventListener("click", () => abrirMedios(elegir));
  c.append(calco, datos, elegir);
  return c;
}

function hojaTapa(ids, seccion, destacadas = []) {
  const h = hojaBase("tapa con-recorrido", "Tapa");
  const lider = estado.medios.get(estado.notas.get(ids[0]).medio);
  const friso = el("div", "friso");
  friso.style.cssText = colores(lider);
  h.append(cartel(), friso);
  if (estado.modo === "tableta" && ids.length > 1) {
    const g = el("div", `grilla ${estado.orientacion === "vertical" ? "vertical" : ids.length === 2 ? "par" : "mosaico"}`);
    ids.forEach((id, i) => {
      const d = destacadas.find((x) => x.id === id);
      g.append(pieza(id, i === 0 ? "principal" : "normal", { seccion: d ? nombreSeccion(d.seccion) : "", conOtras: Boolean(d) || i === 0 }));
    });
    h.append(g);
  } else {
    h.append(pieza(ids[0], "principal", { conOtras: true }));
  }
  h.dataset.seccion = seccion;
  return h;
}

// Lo destacado de cada sección, como un índice de la tapa: una fila por sección.
function hojaResumen(items) {
  const h = hojaBase("resumen con-recorrido", "Lo destacado de cada sección");
  h.append(el("div", "friso techo combinacion"));
  const caja = estado.modo === "tableta" ? el("div", "grilla resumen") : h;
  for (const it of items) caja.append(pieza(it.id, "fila", { seccion: nombreSeccion(it.seccion), conOtras: true }));
  if (caja !== h) h.append(caja);
  return h;
}

function hojaNotas(ids, plantilla, etiqueta, medio) {
  const h = hojaBase(`${plantilla} con-recorrido`, etiqueta);
  // El friso de la pared del andén: la combinación de líneas en las secciones (o la línea del
  // medio, si filtraste). Además ocupa la franja de la hora del iPhone.
  const techo = el("div", `friso techo${medio ? "" : " combinacion"}`);
  if (medio) techo.style.cssText = colores(medio);
  h.append(techo);
  if (estado.modo === "tableta") {
    const g = el("div", `grilla ${plantilla}`);
    const conPrincipal = ["mosaico", "vertical", "una"].includes(plantilla);
    ids.forEach((id, i) => g.append(pieza(id, i === 0 && conPrincipal ? "principal" : "normal")));
    h.append(g);
  } else if (plantilla === "tres") {
    ids.forEach((id, i) => h.append(pieza(id, i === 0 ? "normal" : "chica")));
  } else {
    ids.forEach((id) => h.append(pieza(id, plantilla === "una" ? "principal" : "normal")));
  }
  return h;
}

// La apertura de cada sección: un cartel de estación con la lista de notas como paradas.
// Sin filtro es la combinación (chapa oscura, cada parada con el nombre de su medio);
// con filtro, la pantalla toma el color de la línea de ese medio.
function hojaApertura(sec) {
  const medio = estado.filtro ? estado.medios.get(estado.filtro) : null;
  const h = hojaBase(`apertura${medio ? "" : " combinada"}`, sec.nombre);
  if (medio) h.style.cssText = colores(medio);
  const enc = el("div", "encabezado");
  if (medio) {
    const placa = el("div", "placa");
    placa.append(insignia(medio, "insignia"));
    enc.append(placa);
  } else {
    enc.append(el("div", "riel-apertura"));
  }
  enc.append(el("h2", null, sec.nombre));
  const ultima = estado.notas.get(sec.notas[0]);
  const de = medio ? medio.nombre : `${new Set(sec.notas.map((id) => estado.notas.get(id).medio)).size} medios`;
  enc.append(el("p", "resumen", `${sec.notas.length} ${sec.notas.length === 1 ? "nota" : "notas"} de ${de} · la última, ${hora(ultima.publicada || ultima.fecha)}`));
  const lista = el("ol", "estaciones");
  for (const id of sec.notas) {
    const n = estado.notas.get(id);
    const li = el("li");
    li.dataset.nota = id;
    const b = el("button");
    b.type = "button";
    b.append(el("span", null, n.titulo));
    if (!medio) b.append(el("span", "de", estado.medios.get(n.medio).nombre));
    b.addEventListener("click", () => abrirNota(id));
    li.append(b);
    lista.append(li);
  }
  h.append(enc, lista);
  h.dataset.seccion = sec.id;
  return h;
}

function textoFinal(hoja) {
  const todas = estado.secciones.every((s) => s.notas.every((id) => estado.leidas.has(id)));
  hoja.querySelector("p").textContent = `${todas ? "Leíste toda la edición." : "Llegaste al final de la edición."} La próxima se arma sola en unos minutos.`;
}

function hojaTerminal() {
  const h = hojaBase("terminal", "Fin de la edición");
  h.append(el("div", "riel-final"));
  h.append(el("h2", null, "Fin de la línea."));
  h.append(el("p"));
  const b = el("button", "volver", "Volver a la tapa");
  b.type = "button";
  b.addEventListener("click", () => irA(0));
  h.append(b);
  return h;
}

// La última hoja de una sección puede quedar con menos notas que su plantilla:
// se elige la que tiene exactamente esos lugares, para que nunca quede un hueco.
function ajustar(plantilla, cuantas) {
  if (estado.modo === "tableta") {
    if (cuantas === 1) return "una";
    if (cuantas === 2) return "par";
    if (cuantas === 3 && plantilla === "cuatro") return "trio";
    return plantilla;
  }
  if (cuantas === 1) return "una";
  if (cuantas === 2 && plantilla === "tres") return "dos";
  return plantilla;
}

function seccionesVisibles() {
  const f = estado.filtro;
  return estado.edicion.secciones
    .map((s) => ({ ...s, notas: f ? s.notas.filter((id) => estado.notas.get(id).medio === f) : s.notas }))
    .filter((s) => s.notas.length);
}

function idsDeTapa(secciones) {
  const cuantas = estado.modo === "tableta" ? 3 : 1;
  if (!estado.filtro && estado.edicion.tapa?.length) return estado.edicion.tapa.slice(0, cuantas);
  // Con filtro (o sin tapa armada): lo más fresco con foto de las primeras secciones.
  const candidatas = secciones.flatMap((s) => s.notas).map((id) => estado.notas.get(id));
  const elegidas = candidatas.filter((n) => n.foto && !n.a_medias);
  return (elegidas.length ? elegidas : candidatas).slice(0, cuantas).map((n) => n.id);
}

function armarHojas() {
  const tableta = estado.modo === "tableta";
  const medio = estado.filtro ? estado.medios.get(estado.filtro) : null;
  libro.replaceChildren();
  estado.hojas = [];
  estado.secciones = seccionesVisibles();
  const sumar = (elemento, seccion, ids) => {
    libro.append(elemento);
    estado.hojas.push({ el: elemento, seccion, notas: ids });
  };
  const d = estado.edicion.destacadas;
  let tapa;
  if (!estado.filtro && d?.principal && estado.notas.has(d.principal)) {
    // Tapa ampliada: la principal del momento y lo más destacado de cada sección (en su propio tramo).
    const items = d.secciones.filter((x) => estado.notas.has(x.nota) && x.nota !== d.principal).map((x) => ({ id: x.nota, seccion: x.id }));
    const arriba = tableta ? items.slice(0, 2) : [];
    const abajo = tableta ? items.slice(2) : items;
    const primera = [d.principal, ...arriba.map((x) => x.id)];
    tapa = [d.principal, ...items.map((x) => x.id)];
    sumar(hojaTapa(primera, "tapa", arriba), "tapa", primera);
    const porHoja = tableta ? 6 : estado.orientacion === "horizontal" ? 2 : 4;  // acostado, dos lado a lado
    for (let i = 0; i < abajo.length; i += porHoja) {
      const tramo = abajo.slice(i, i + porHoja);
      const h = hojaResumen(tramo);
      h.dataset.seccion = "tapa";
      sumar(h, "tapa", tramo.map((x) => x.id));
    }
  } else {
    tapa = idsDeTapa(estado.secciones);
    const seccionTapa = estado.secciones.find((s) => s.notas.includes(tapa[0]))?.id || estado.secciones[0].id;
    sumar(hojaTapa(tapa, seccionTapa), seccionTapa, tapa);
  }

  const patron = tableta ? [["mosaico", 3], ["cuatro", 4], ["trio", 3]] : [["dos", 2], ["una", 1], ["tres", 3]];
  for (const sec of estado.secciones) {
    sumar(hojaApertura(sec), sec.id, []);
    const resto = sec.notas.filter((id) => !tapa.includes(id));
    for (const t of trozos(resto, patron)) {
      sumar(hojaNotas(t.ids, ajustar(t.plantilla, t.ids.length), sec.nombre, medio), sec.id, t.ids);
    }
  }
  sumar(hojaTerminal(), "fin", []);
}

// Las estaciones de una apertura muestran el título completo. Si no entran todas,
// las últimas se resumen en una estación "y N notas más" (nunca se corta un título).
function ajustarEstaciones(hoja) {
  const lista = hoja.querySelector(".estaciones");
  if (!lista || hoja.hidden) return;
  lista.querySelector(".mas")?.remove();
  const items = [...lista.querySelectorAll("li")];
  items.forEach((li) => { li.hidden = false; });
  let ocultas = 0;
  const mas = el("li", "mas");
  while (lista.scrollHeight > lista.clientHeight + 1 && items.length - ocultas > 1) {
    ocultas++;
    items[items.length - ocultas].hidden = true;
    mas.textContent = `y ${ocultas} ${ocultas === 1 ? "nota más" : "notas más"} en las próximas hojas`;
    if (!mas.isConnected) lista.append(mas);
  }
}

/* ---------- marcas de estación: leída, pendiente, a medias ---------- */
function marcaDeHoja(h) {
  if (!h.notas.length) return "";
  const leidas = h.notas.filter((id) => estado.leidas.has(id)).length;
  return leidas === h.notas.length ? "leida" : leidas ? "a-medias" : "";
}

function nombreSeccion(id) {
  if (id === "tapa") return "Tapa";
  if (id === "cordoba") return "Política de Córdoba";  // la fila propia de Córdoba en la tapa
  return estado.secciones.find((s) => s.id === id)?.nombre || "";
}

function pintarRecorrido() {
  const h = estado.hojas[estado.actual];
  const via = recorrido.querySelector(".via");
  recorrido.classList.toggle("sobre-color", h.seccion === "fin" || h.el.classList.contains("apertura"));
  const deSeccion = estado.hojas.map((x, i) => ({ ...x, i })).filter((x) => x.seccion === h.seccion && x.notas.length);
  const riel = el("div", "riel");
  if (estado.filtro) recorrido.style.setProperty("--linea", estado.medios.get(estado.filtro).linea.color);
  else riel.classList.add("combinacion");
  via.replaceChildren(riel);
  // Con muchas hojas, las estaciones se achican para no pisarse (la actual queda grande).
  const lugar = via.clientWidth / Math.max(1, deSeccion.length);
  via.classList.toggle("apretada", lugar < 18 && lugar >= 10);
  via.classList.toggle("muy-apretada", lugar < 10);
  deSeccion.forEach((x, k) => {
    const est = el("span", `estacion ${marcaDeHoja(x)}`);
    if (x.i === estado.actual) est.classList.add("aca");
    est.style.left = deSeccion.length > 1 ? `${(k / (deSeccion.length - 1)) * 100}%` : "0%";
    via.append(est);
  });
  const pos = deSeccion.findIndex((x) => x.i === estado.actual) + 1;
  const donde = recorrido.querySelector(".donde");
  donde.replaceChildren();
  if (pos) donde.append(Object.assign(el("b"), { textContent: nombreSeccion(h.seccion) }), document.createTextNode(` · estación ${pos} de ${deSeccion.length}`));
  const siguiente = estado.hojas.slice(estado.actual + 1).find((x) => x.seccion !== h.seccion);
  const ultima = siguiente && pos === deSeccion.length && siguiente.seccion !== "fin";
  const proxima = recorrido.querySelector(".proxima-seccion");
  proxima.textContent = estado.actual === 0 ? "Pasá la hoja" : ultima ? `Próxima: ${nombreSeccion(siguiente.seccion)}` : "";
  // Si en el teléfono no entra en un renglón: sin el número de estación y con una flecha.
  if (ultima && (donde.offsetHeight > 20 || proxima.offsetHeight > 20)) {
    donde.replaceChildren(Object.assign(el("b"), { textContent: nombreSeccion(h.seccion) }));
    const flecha = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    flecha.setAttribute("viewBox", "0 0 24 24");
    flecha.setAttribute("aria-hidden", "true");
    flecha.innerHTML = '<path d="M4 12h15M13 6l6 6-6 6"/>';
    proxima.replaceChildren(el("span", "oculto", "Próxima: "), flecha, document.createTextNode(nombreSeccion(siguiente.seccion)));
  }
}

function pintarAperturas() {
  for (const li of libro.querySelectorAll(".estaciones li[data-nota]")) {
    const id = li.dataset.nota;
    const n = estado.notas.get(id);
    li.classList.toggle("leida", estado.leidas.has(id) && !n.a_medias);
    li.classList.toggle("a-medias", estado.leidas.has(id) && n.a_medias);
  }
}

/* ---------- mostrar una hoja ---------- */
// Las fotos de las hojas vecinas se cargan antes: así el pliegue nunca muestra un hueco en blanco.
function precargar(i) {
  for (const k of [i + 1, i - 1, i + 2]) {
    const h = estado.hojas[k];
    if (!h) continue;
    for (const img of h.el.querySelectorAll("img")) {
      if (img.loading === "lazy") img.loading = "eager";
      img.decode?.().catch(() => {});
    }
  }
}

function mostrar(i) {
  i = Math.max(0, Math.min(i, estado.hojas.length - 1));
  estado.hojas.forEach((h, k) => {
    h.el.hidden = k !== i;
    h.el.inert = k !== i;
    h.el.style.zIndex = "";
    h.el.style.clipPath = "";
  });
  estado.actual = i;
  ajustarEstaciones(estado.hojas[i].el);
  if (estado.hojas[i].seccion === "fin") textoFinal(estado.hojas[i].el);
  pintarRecorrido();
  chipFiltro.classList.toggle("en-tapa", i === 0);  // en la tapa ya lo dice el cartel
  precargar(i);
  guardarMemoria("posicion", { edicion: estado.edicion.generada, hoja: i, modo: estado.modo, filtro: estado.filtro });
}

function irA(i) {
  if (i < 0 || i === estado.actual) return;
  if (reducido.matches || Math.abs(i - estado.actual) > 1) {
    mostrar(i);
    return;
  }
  pasar(i > estado.actual ? 1 : -1);
}

/* ---------- filtro por medio: se elige en la lista de medios ---------- */
function filtrar(medioId) {
  estado.filtro = medioId;
  estado.modo = "";  // fuerza a rearmar
  rearmar(false);
  mostrar(0);
  pintarFiltro();
}
function pintarFiltro() {
  const m = estado.filtro && estado.medios.get(estado.filtro);
  chipFiltro.hidden = !m;
  if (!m) return;
  chipFiltro.querySelector(".texto").replaceChildren(document.createTextNode(`Sólo ${m.nombre}`), flechita());
}
chipFiltro.querySelector(".texto").addEventListener("click", (ev) => abrirMedios(ev.currentTarget));
chipFiltro.querySelector(".quitar").addEventListener("click", () => filtrar(null));

/* ---------- la lista de medios: un desplegable con los nombres, por grupo ---------- */
const desplegable = document.getElementById("medios");
const GRUPOS = [["aca", "De acá"], ["afuera", "De afuera"], ["temas", "Economía y tecnología"]];
let abridorMedios = null;

function flechita() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("flechita");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", "M6 9l6 6 6-6");
  svg.append(p);
  return svg;
}
function abrirMedios(desde) {
  const e = estado.edicion;
  const cuantas = new Map();
  for (const n of e.notas) cuantas.set(n.medio, (cuantas.get(n.medio) || 0) + 1);
  const lista = desplegable.querySelector(".lista");
  lista.replaceChildren();
  const fila = (nombre, cuenta, id) => {
    const b = el("button", "fila");
    b.type = "button";
    b.setAttribute("aria-pressed", String(estado.filtro === id));
    const tilde = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    tilde.setAttribute("viewBox", "0 0 24 24");
    tilde.setAttribute("aria-hidden", "true");
    tilde.innerHTML = '<path d="M5 12.5l4.5 4.5L19 7.5"/>';
    b.append(el("span", "nombre", nombre), el("span", "cuenta", `${cuenta} ${cuenta === 1 ? "nota" : "notas"}`), tilde);
    b.addEventListener("click", () => { cerrarMedios(); if (estado.filtro !== id) filtrar(id); });
    return b;
  };
  lista.append(fila("Todos los medios", e.notas.length, null));
  const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, "es");
  const conGrupo = e.medios.some((m) => m.grupo);  // ediciones viejas: una sola lista
  for (const [g, titulo] of conGrupo ? GRUPOS : [[null, null]]) {
    const deEste = e.medios.filter((m) => !conGrupo || m.grupo === g).sort(porNombre);
    if (!deEste.length) continue;
    if (titulo) lista.append(el("h3", null, titulo));
    for (const m of deEste) lista.append(fila(m.nombre, cuantas.get(m.id) || 0, m.id));
  }
  // Cuelga del botón que lo abrió; si ese botón no está a la vista, arriba de todo.
  const caja = desplegable.querySelector(".caja");
  const r = desde?.isConnected ? desde.getBoundingClientRect() : null;
  const ancho = Math.min(400, innerWidth - 24);
  // Si no entra hacia la derecha (el selector del iPad está a la derecha), se alinea con el borde derecho del botón.
  const izq = !r || !r.width ? (innerWidth - ancho) / 2
    : r.left + ancho <= innerWidth - 12 ? Math.max(12, r.left) : Math.max(12, r.right - ancho);
  caja.style.width = `${ancho}px`;
  caja.style.left = `${izq}px`;
  caja.style.setProperty("--arriba", r && r.height ? `${r.bottom + 8}px` : "calc(var(--seguro-arriba) + 16px)");
  abridorMedios = desde;
  desde?.setAttribute?.("aria-expanded", "true");
  desplegable.hidden = false;
  lista.scrollTop = 0;
  requestAnimationFrame(() => desplegable.classList.add("abierto"));
  const elegida = lista.querySelector('[aria-pressed="true"]') || lista.querySelector("button");
  elegida.focus({ preventScroll: true });
  elegida.scrollIntoView({ block: "nearest" });  // el medio elegido, a la vista
}
function cerrarMedios() {
  desplegable.classList.remove("abierto");
  abridorMedios?.setAttribute?.("aria-expanded", "false");
  setTimeout(() => { desplegable.hidden = true; }, 200);
}
desplegable.querySelector(".cerrar").addEventListener("click", cerrarMedios);
desplegable.addEventListener("click", (ev) => { if (ev.target === desplegable) cerrarMedios(); });

/* ---------- el pliegue ---------- */
function crearPliegue(sentido) {
  const actual = estado.hojas[estado.actual].el;
  const destino = estado.hojas[estado.actual + sentido].el;
  const horizontal = estado.modo === "tableta";
  const W = libro.clientWidth, H = libro.clientHeight;

  destino.hidden = false;
  destino.inert = true;
  ajustarEstaciones(destino);
  if (estado.hojas[estado.actual + sentido].seccion === "fin") textoFinal(destino);
  destino.style.zIndex = "1";
  actual.style.zIndex = "2";
  // Media hoja actual que queda quieta.
  const quieta = horizontal ? (sentido > 0 ? "inset(0 50% 0 0)" : "inset(0 0 0 50%)") : (sentido > 0 ? "inset(0 0 50% 0)" : "inset(50% 0 0 0)");
  actual.style.clipPath = quieta;

  // Ojo: no usar la clase "horizontal" acá; es la del teléfono acostado y cambiaría el diseño de las copias.
  const pliegue = el("div", `pliegue${horizontal ? " eje-x" : ""}`);
  const hojeador = el("div", "hojeador");
  const caja = horizontal
    ? { left: sentido > 0 ? W / 2 : 0, top: 0, width: W / 2, height: H, origen: sentido > 0 ? "0% 50%" : "100% 50%" }
    : { left: 0, top: sentido > 0 ? H / 2 : 0, width: W, height: H / 2, origen: sentido > 0 ? "50% 0%" : "50% 100%" };
  Object.assign(hojeador.style, { left: `${caja.left}px`, top: `${caja.top}px`, width: `${caja.width}px`, height: `${caja.height}px`, transformOrigin: caja.origen });

  const cara = (hoja, dx, dy, clase) => {
    const m = el("div", `mitad ${clase}`);
    Object.assign(m.style, { inset: "0" });
    const copia = hoja.cloneNode(true);
    copia.hidden = false;
    copia.removeAttribute("inert");
    Object.assign(copia.style, { position: "absolute", width: `${W}px`, height: `${H}px`, left: `${dx}px`, top: `${dy}px`, clipPath: "", zIndex: "" });
    m.append(copia, el("div", "sombra"));
    return m;
  };
  // Frente: la mitad de la hoja actual que se levanta. Dorso: la mitad de la de destino.
  const frente = horizontal ? cara(actual, -caja.left, 0, "frente") : cara(actual, 0, -caja.top, "frente");
  const otraIzq = horizontal ? (sentido > 0 ? 0 : -W / 2) : 0;
  const otraArr = horizontal ? 0 : (sentido > 0 ? 0 : -H / 2);
  const dorso = cara(destino, otraIzq, otraArr, "dorso");
  hojeador.append(frente, dorso);

  // Sombra sobre la mitad de la hoja de destino que se va descubriendo.
  const base = el("div", "mitad");
  Object.assign(base.style, { left: `${caja.left}px`, top: `${caja.top}px`, width: `${caja.width}px`, height: `${caja.height}px` });
  base.append(el("div", "sombra"));
  pliegue.append(base, hojeador);
  libro.append(pliegue);

  const giro = horizontal ? "rotateY" : "rotateX";
  // Signo para que la hoja venga hacia quien lee.
  const signo = horizontal ? (sentido > 0 ? -1 : 1) : (sentido > 0 ? 1 : -1);
  const sombraFrente = frente.querySelector(".sombra");
  const sombraDorso = dorso.querySelector(".sombra");
  const sombraBase = base.querySelector(".sombra");
  return {
    angulo: 0,
    pintar(a) {
      this.angulo = a;
      hojeador.style.transform = `${giro}(${signo * a}deg)`;
      sombraFrente.style.opacity = a < 90 ? (0.38 * (a / 90)).toFixed(3) : "0";
      sombraDorso.style.opacity = a >= 90 ? (0.38 * (1 - (a - 90) / 90)).toFixed(3) : "0";
      sombraBase.style.opacity = (0.32 * (1 - a / 180)).toFixed(3);
    },
    cerrar(completo) {
      if (completo) {
        // Primero la hoja de destino queda firme y después se saca el pliegue: sin cuadro intermedio.
        mostrar(estado.actual + sentido);
        pliegue.remove();
      } else {
        pliegue.remove();
        destino.hidden = true;
        destino.style.zIndex = "";
        actual.style.zIndex = "";
        actual.style.clipPath = "";
      }
    },
  };
}

function animar(pliegue, hasta, duracion, alTerminar) {
  const desde = pliegue.angulo;
  const t0 = performance.now();
  const paso = (t) => {
    const p = Math.min(1, (t - t0) / duracion);
    const e = 1 - Math.pow(1 - p, 3);
    pliegue.pintar(desde + (hasta - desde) * e);
    if (p < 1) requestAnimationFrame(paso);
    else alTerminar();
  };
  requestAnimationFrame(paso);
}

function pasar(sentido) {
  if (estado.ocupado) return;
  const destino = estado.actual + sentido;
  if (destino < 0 || destino >= estado.hojas.length) return rebote(sentido);
  if (reducido.matches) return mostrar(destino);
  estado.ocupado = true;
  const p = crearPliegue(sentido);
  p.pintar(0);
  animar(p, 180, 560, () => { p.cerrar(true); estado.ocupado = false; });
}

function rebote(sentido) {
  const h = estado.hojas[estado.actual].el;
  const eje = estado.modo === "tableta" ? "X" : "Y";
  h.animate([{ transform: "none" }, { transform: `translate${eje}(${-sentido * 18}px)` }, { transform: "none" }],
    { duration: 380, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
}

/* ---------- gesto: arrastrar para pasar la hoja ---------- */
let gesto = null;
let suprimirClic = false;

libro.addEventListener("pointerdown", (ev) => {
  if (estado.ocupado || gesto || !ev.isPrimary || ev.button !== 0) return;
  gesto = { x: ev.clientX, y: ev.clientY, t: ev.timeStamp, id: ev.pointerId, pliegue: null, sentido: 0 };
});

libro.addEventListener("pointermove", (ev) => {
  if (!gesto || ev.pointerId !== gesto.id) return;
  const horizontal = estado.modo === "tableta";
  const delta = horizontal ? ev.clientX - gesto.x : ev.clientY - gesto.y;
  const cruzado = horizontal ? ev.clientY - gesto.y : ev.clientX - gesto.x;
  if (!gesto.pliegue && !gesto.rebote) {
    if (Math.abs(delta) < 10 || Math.abs(delta) < Math.abs(cruzado)) return;
    gesto.sentido = delta < 0 ? 1 : -1;
    libro.setPointerCapture(ev.pointerId);
    suprimirClic = true;
    const destino = estado.actual + gesto.sentido;
    if (destino < 0 || destino >= estado.hojas.length || reducido.matches) gesto.rebote = true;
    else { gesto.pliegue = crearPliegue(gesto.sentido); estado.ocupado = true; }  // teclas y rueda esperan
  }
  if (gesto.pliegue) {
    const largoEje = horizontal ? libro.clientWidth : libro.clientHeight;
    const avance = Math.max(0, Math.min(1, (-gesto.sentido * delta) / (largoEje * 0.8)));
    gesto.pliegue.pintar(avance * 180);
  }
});

function soltar(ev) {
  if (!gesto || ev.pointerId !== gesto.id) return;
  const g = gesto;
  gesto = null;
  if (g.rebote) { rebote(g.sentido); return; }
  if (!g.pliegue) return;
  const horizontal = estado.modo === "tableta";
  const delta = horizontal ? ev.clientX - g.x : ev.clientY - g.y;
  const velocidad = (-g.sentido * delta) / Math.max(1, ev.timeStamp - g.t); // px por ms a favor del pase
  const completo = g.pliegue.angulo > 80 || (velocidad > 0.45 && g.pliegue.angulo > 12);
  estado.ocupado = true;
  const resto = completo ? 180 - g.pliegue.angulo : g.pliegue.angulo;
  animar(g.pliegue, completo ? 180 : 0, 160 + resto * 2.2, () => { g.pliegue.cerrar(completo); estado.ocupado = false; });
}
libro.addEventListener("pointerup", soltar);
libro.addEventListener("pointercancel", soltar);
// Un arrastre no es un toque: que no abra la nota que quedó debajo del dedo.
libro.addEventListener("click", (ev) => {
  if (suprimirClic) { ev.stopPropagation(); ev.preventDefault(); }
  suprimirClic = false;
}, true);
libro.addEventListener("pointerdown", () => { suprimirClic = false; }, true);

let ruedaAcumulada = 0;
libro.addEventListener("wheel", (ev) => {
  ev.preventDefault();
  ruedaAcumulada += Math.abs(ev.deltaY) > Math.abs(ev.deltaX) ? ev.deltaY : ev.deltaX;
  if (Math.abs(ruedaAcumulada) > 70) { pasar(ruedaAcumulada > 0 ? 1 : -1); ruedaAcumulada = 0; }
}, { passive: false });

function capaAbierta() {
  if (!hojaApunte.hidden) return "apunte";
  if (!hojitaExportar.hidden) return "exportar";
  if (!hojitaCompartir.hidden) return "compartir";
  if (!hojitaTarde.hidden) return "tarde";
  if (!hojitaAvisos.hidden) return "avisos";
  if (!desplegable.hidden) return "medios";
  if (lector.classList.contains("abierto")) return "lector";
  if (!panel.hidden) return "panel";
  if (!indice.hidden) return "indice";
  return null;
}
document.addEventListener("keydown", (ev) => {
  if (!estado.edicion || ev.target.closest?.("textarea, [contenteditable], input:not([type=checkbox])")) return;
  const capa = capaAbierta();
  if (capa === "lector" && teclaDelMarcador(ev)) { ev.preventDefault(); return; }
  if (capa) {
    if (ev.key === "Escape" && capa !== "apunte") ({ exportar: cerrarExportar, compartir: cerrarCompartir, tarde: cerrarHojita, avisos: cerrarAvisos, medios: cerrarMedios, lector: cerrarNota, panel: cerrarPanel, indice: cerrarIndice })[capa]();
    return;
  }
  if (["ArrowDown", "ArrowRight", "PageDown", " "].includes(ev.key)) { ev.preventDefault(); pasar(1); }
  if (["ArrowUp", "ArrowLeft", "PageUp"].includes(ev.key)) { ev.preventDefault(); pasar(-1); }
  if (ev.key === "Home") mostrar(0);
});

/* ---------- lector ---------- */
const PERMITIDAS = new Set(["P", "H2", "H3", "H4", "STRONG", "B", "EM", "I", "A", "BLOCKQUOTE", "UL", "OL", "LI", "FIGURE", "FIGCAPTION", "IMG", "BR", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "SPAN", "SUB", "SUP"]);

function limpiarCuerpo(html, fotoPrincipal, base) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const raiz = doc.body.firstElementChild;
  const nombreFoto = (u) => { try { return new URL(u, base).pathname.split("/").pop().split(".")[0]; } catch { return ""; } };
  const principal = nombreFoto(fotoPrincipal);
  for (const n of [...raiz.querySelectorAll("*")]) {
    if (!n.isConnected) continue;
    if (!PERMITIDAS.has(n.tagName)) {
      if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "FORM", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "NOSCRIPT", "SVG", "VIDEO", "AUDIO"].includes(n.tagName)) n.remove();
      else n.replaceWith(...n.childNodes);
      continue;
    }
    for (const a of [...n.attributes]) {
      if (!(n.tagName === "A" && a.name === "href") && !(n.tagName === "IMG" && ["src", "alt"].includes(a.name))) n.removeAttribute(a.name);
    }
    if (n.tagName === "A") {
      const href = n.getAttribute("href") || "";
      if (!/^https?:/i.test(href)) { n.replaceWith(...n.childNodes); continue; }
      n.target = "_blank";
      n.rel = "noopener";
    }
    if (n.tagName === "IMG") {
      const src = n.getAttribute("src");
      if (!src || (principal && nombreFoto(src) === principal)) { (n.closest("figure") || n).remove(); continue; }
      try { n.src = new URL(src, base).href; } catch { n.remove(); continue; }
      n.alt = n.getAttribute("alt") || "";
      n.loading = "lazy";
      n.decoding = "async";
      n.referrerPolicy = "no-referrer";
    }
  }
  for (const p of [...raiz.querySelectorAll("p")]) if (!p.textContent.trim() && !p.querySelector("img")) p.remove();
  return raiz;
}

// La próxima nota de la misma sección (en la edición que estás viendo).
function proximaDe(id) {
  const sec = estado.secciones.find((s) => s.notas.includes(id));
  return sec ? sec.notas[sec.notas.indexOf(id) + 1] : null;
}

function abrirNota(id, { sinAnimacion = false, marca = null } = {}) {
  const n = notaPorId(id);
  if (!n) return;
  if (apunteAbierto) { if (!hojaApunte.hidden) cerrarApunte(); else cerrarEdicionAlMargen(); }
  clearTimeout(temporizadorPista);
  const m = medioDe(n);
  estado.respaldo.set(id, { nota: n, medio: { id: m.id, nombre: m.nombre, linea: m.linea } });
  estado.notaAbierta = id;
  lector.style.setProperty("--linea", m.linea.color);
  lector.style.setProperty("--linea-tinta", m.linea.tinta);

  const barra = lector.querySelector(".barra .medio");
  barra.replaceChildren(insignia(m), document.createTextNode(` ${m.nombre} `), el("span", null, `· ${[hora(n.publicada || n.fecha), `${n.minutos} min`].filter(Boolean).join(" · ")}`));

  const art = lector.querySelector("article");
  art.replaceChildren();
  art.append(el("h1", null, n.titulo));
  const plano = (t) => t.replace(/\s+/g, " ").trim().toLowerCase();
  const cuerpoPlano = plano(textoPlano(n.cuerpo_html)).slice(0, 400);
  if (n.bajada && !cuerpoPlano.startsWith(plano(n.bajada).slice(0, 80))) art.append(el("p", "bajada", n.bajada));
  const firma = [n.autor, hora(n.fecha || n.publicada), n.a_medias ? "" : `${n.minutos} min de lectura`].filter(Boolean).join(" · ");
  if (firma) art.append(el("p", "firma", firma));
  if (n.foto) {
    const f = el("img", "principal");
    f.src = n.foto;
    f.alt = "";
    f.referrerPolicy = "no-referrer";
    f.addEventListener("error", () => f.remove(), { once: true });
    art.append(f);
  }
  if (n.a_medias) {
    const medias = el("p", "medias");
    // Algunos medios (El Alfil, La Nueva Mañana) no dejan leer nada desde la app: sólo llega el título.
    medias.append(el("b", null, "Nota a medias. "), document.createTextNode(n.cuerpo_html
      ? `${m.nombre} sólo deja leer el comienzo desde acá. La nota completa está en su sitio.`
      : `${m.nombre} no deja leer sus notas desde acá. La nota entera está en su sitio.`));
    art.append(medias);
  }
  const cuerpo = el("div", "cuerpo");
  cuerpo.append(...limpiarCuerpo(n.cuerpo_html, n.foto, n.url).childNodes);
  art.append(cuerpo);

  const cierre = lector.querySelector(".cierre");
  cierre.replaceChildren();
  const original = el("a", "original");
  original.href = n.url;
  original.target = "_blank";
  original.rel = "noopener";
  original.append(document.createTextNode(!n.cuerpo_html ? `Leer en ${m.nombre}` : n.a_medias ? `Seguir leyendo en ${m.nombre}` : `Ver la nota en ${m.nombre}`));
  original.insertAdjacentHTML("beforeend", ICONO.externo);
  cierre.append(original);
  const versiones = otrasVersiones(id);
  if (versiones.length) {
    const bloque = el("section", "versiones");
    bloque.setAttribute("aria-label", "Otras versiones de esta noticia");
    bloque.append(el("h2", null, "También la cuentan"));
    const ul = el("ul");
    for (const o of versiones) {
      const on = estado.notas.get(o);
      const b = el("button");
      b.type = "button";
      b.append(el("b", null, estado.medios.get(on.medio).nombre), el("span", null, on.titulo));
      b.addEventListener("click", () => { lector.scrollTo({ top: 0 }); abrirNota(o); });
      const li = el("li");
      li.append(b);
      ul.append(li);
    }
    bloque.append(ul);
    cierre.append(bloque);
  }
  const sig = proximaDe(id);
  if (sig) {
    const b = el("button", "proxima");
    b.type = "button";
    const titulo = estado.notas.get(sig).titulo;
    b.setAttribute("aria-label", `Próxima nota de ${nombreSeccion(estado.notas.get(sig).categoria) || "la sección"}: ${titulo}`);
    b.append(el("span", null, titulo));
    b.insertAdjacentHTML("beforeend", ICONO.flecha);
    b.addEventListener("click", () => { lector.scrollTo({ top: 0 }); abrirNota(sig); });
    cierre.append(b);
  }
  pintarBotonesLector();

  lector.hidden = false;
  lector.scrollTop = 0;
  if (sinAnimacion || reducido.matches) {
    lector.style.transition = "none";
    lector.classList.add("abierto");
    void lector.offsetHeight;
    lector.style.transition = "";
  } else {
    requestAnimationFrame(() => requestAnimationFrame(() => lector.classList.add("abierto")));
  }
  for (const n2 of [libro, recorrido, indiceBoton, chipFiltro, panel]) n2.inert = true;
  estado.marcaElegida = null;
  cerrarMarcador();
  estado.versionPintada = estado.notas.has(id) && estado.notas.get(id) === n ? "edicion" : "copia";
  repintarMarcas();
  // Si alguna marca no aparece en esta versión de la nota pero sí en la copia que guardaste, se lee esa copia.
  const regAbierto = estado.biblioteca.get(id);
  if (estado.marcasPerdidas.size && regAbierto?.nota?.cuerpo_html && regAbierto.nota.cuerpo_html !== n.cuerpo_html) {
    const antes = estado.marcasPerdidas.size;
    cuerpo.replaceChildren(...limpiarCuerpo(regAbierto.nota.cuerpo_html, n.foto, n.url).childNodes);
    estado.versionPintada = "copia";
    repintarMarcas();
    if (estado.marcasPerdidas.size > antes) {
      cuerpo.replaceChildren(...limpiarCuerpo(n.cuerpo_html, n.foto, n.url).childNodes);
      estado.versionPintada = "edicion";
      repintarMarcas();
    }
  }
  observadorCuerpo?.disconnect();
  observadorCuerpo = window.ResizeObserver ? new ResizeObserver(reacomodarApuntes) : null;
  observadorCuerpo?.observe(cuerpo);
  for (const img of art.querySelectorAll("img")) if (!img.complete) img.addEventListener("load", reacomodarApuntes, { once: true });
  lector.querySelector("button.cerrar").focus({ preventScroll: true });
  if (!marca) temporizadorPista = setTimeout(mostrarPistaSiHaceFalta, reducido.matches ? 0 : 460);
  // Desde Anotaciones: la nota se abre en la marca que tocaste.
  const enMarca = marca && cuerpo.querySelector(`mark[data-id="${marca}"].ini`);
  if (enMarca) {
    // Las fotos de arriba cargan después y empujan el texto: se vuelve a centrar mientras cargan,
    // salvo que ya hayas empezado a mover la nota.
    const hasta = Date.now() + 2500;
    let tocaste = false;
    lector.addEventListener("touchstart", () => { tocaste = true; }, { once: true, passive: true });
    lector.addEventListener("wheel", () => { tocaste = true; }, { once: true, passive: true });
    const centrar = () => { if (!tocaste && Date.now() < hasta) enMarca.scrollIntoView({ block: "center" }); };
    centrar();
    for (const img of art.querySelectorAll("img")) if (!img.complete) img.addEventListener("load", centrar, { once: true });
    setTimeout(centrar, 460);  // cuando termina de subir el lector
    for (const m of cuerpo.querySelectorAll(`mark[data-id="${marca}"]`)) m.classList.add("resalta");
  }

  estado.leidas.add(id);
  guardarMemoria("leidas", [...estado.leidas].slice(-800));
  // Si estaba para más tarde, ya la estás leyendo: sale de esa lista.
  const reg = estado.biblioteca.get(id);
  if (reg?.masTarde) { reg.masTarde = null; reg.avisado = false; persistir(reg); }
  pintarAperturas();
  pintarRecorrido();
}

function cerrarNota() {
  lector.classList.remove("abierto");
  if (apunteAbierto) { if (!hojaApunte.hidden) cerrarApunte(); else cerrarEdicionAlMargen(); }
  clearTimeout(temporizadorPista);
  cerrarMarcador();
  observadorCuerpo?.disconnect();
  estado.notaAbierta = null;
  // Si la abriste desde tus notas, volvés a tus notas.
  for (const n of [libro, recorrido, indiceBoton, chipFiltro]) n.inert = !panel.hidden;
  panel.inert = false;
  const fin = () => { if (!lector.classList.contains("abierto")) lector.hidden = true; };
  if (reducido.matches) fin(); else setTimeout(fin, 440);
  if (!panel.hidden) dibujarPanel();
}
lector.querySelector("button.cerrar").addEventListener("click", cerrarNota);

function pintarBotonesLector() {
  const reg = estado.biblioteca.get(estado.notaAbierta);
  const g = lector.querySelector(".guardar");
  const guardada = Boolean(reg?.guardada);
  g.setAttribute("aria-pressed", String(guardada));
  g.setAttribute("aria-label", guardada ? "Quitar de guardadas" : "Guardar la nota");
  g.classList.toggle("activo", guardada);
  lector.querySelector(".tarde").classList.toggle("activo", Boolean(reg?.masTarde));
}

lector.querySelector(".guardar").addEventListener("click", async () => {
  const reg = registroDe(estado.notaAbierta);
  reg.guardada = reg.guardada ? null : new Date().toISOString();
  await persistir(reg);
  pintarBotonesLector();
  avisar(reg.guardada ? "Guardada" : "Quitada de guardadas");
});
lector.querySelector(".compartir").addEventListener("click", () => compartir([estado.notaAbierta], "compartir"));
lector.querySelector(".tarde").addEventListener("click", () => abrirHojita(estado.notaAbierta));

/* ---------- marcas: tocás una frase (o elegís un pedazo) y un color. Color, apunte al lado y borrar ---------- */
// Cada marca: { id, texto, color, apunte, creado, editado, ancla:{inicio, antes, despues} }.
// Se ubica en el texto por su contenido y su contexto (el ancla), nunca por posición del DOM.
const COLORES = ["amarillo", "verde", "celeste", "rosa"];
const COLOR_SINGULAR = { amarillo: "amarilla", verde: "verde", celeste: "celeste", rosa: "rosa" };
const COLOR_PLURAL = { amarillo: "amarillas", verde: "verdes", celeste: "celestes", rosa: "rosas" };
const marcador = document.getElementById("marcador");
const hojaApunte = document.getElementById("apunte");
const BLOQUE_TEXTO = "p, li, h2, h3, h4, blockquote, figcaption, td, th";

function fnv1a32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
const textoLimpio = (t) => (t || "").normalize("NFC").replace(/\s+/g, " ").trim();
const idNuevoDeMarca = () => `mk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
// Marcas guardadas por versiones anteriores ({texto, creado}): se completan en memoria, sin reescribir la base.
function normalizarMarca(d) {
  d.texto = textoLimpio(d.texto);
  if (!d.id) d.id = `mk-v1-${fnv1a32(d.texto).toString(16)}`;
  if (!COLORES.includes(d.color)) d.color = "amarillo";
  if (typeof d.apunte !== "string") d.apunte = "";
  if (!("editado" in d)) d.editado = null;
  if (!("ancla" in d)) d.ancla = null;
  return d;
}
function pedirPersistencia() {
  if (leerMemoria("persistencia-pedida", false)) return;
  guardarMemoria("persistencia-pedida", true);
  navigator.storage?.persist?.().catch(() => {});
}

// El texto del cuerpo, normalizado (espacios simples y un espacio entre bloques), con el camino de vuelta al DOM.
function indiceDeTexto(raiz) {
  const normal = [], mapa = [], bloqueDe = [];
  const desdeNodo = new Map();
  let bloque = null, nBloque = -1, enBlanco = true;
  const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => {
      if (n.nodeType === Node.ELEMENT_NODE) {
        if (n.matches("aside.apunte, .margen")) return NodeFilter.FILTER_REJECT;
        return n.tagName === "BR" ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
      return n.parentElement.closest("aside.apunte, .margen") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  while (w.nextNode()) {
    const nodo = w.currentNode;
    if (nodo.nodeType === Node.ELEMENT_NODE) {   // <br>: un espacio, para que no se peguen las palabras
      if (!enBlanco && normal.length) { normal.push(" "); mapa.push(null); bloqueDe.push(nBloque); enBlanco = true; }
      continue;
    }
    const nfc = nodo.data.normalize("NFC");
    if (nfc !== nodo.data) nodo.data = nfc;
    const b = nodo.parentElement.closest(BLOQUE_TEXTO) || raiz;
    if (b !== bloque) {
      if (normal.length && !enBlanco) { normal.push(" "); mapa.push(null); bloqueDe.push(-1); }
      bloque = b;
      nBloque++;
      enBlanco = true;
    }
    const d = nodo.data;
    const offs = new Int32Array(d.length + 1);
    for (let i = 0; i < d.length; i++) {
      const c = d[i];
      if (/\s/.test(c)) {
        offs[i] = Math.max(0, normal.length - (enBlanco ? 1 : 0));
        if (!enBlanco) { normal.push(" "); mapa.push({ n: nodo, o: i }); bloqueDe.push(nBloque); enBlanco = true; }
      } else {
        offs[i] = normal.length;
        normal.push(c);
        mapa.push({ n: nodo, o: i });
        bloqueDe.push(nBloque);
        enBlanco = false;
      }
    }
    offs[d.length] = normal.length;
    desdeNodo.set(nodo, offs);
  }
  return { normal: normal.join(""), mapa, bloqueDe, desdeNodo };
}
// De un punto del DOM (nodo + offset) a una posición del texto normalizado.
function posicionDe(indice, nodo, offset) {
  if (nodo.nodeType === Node.TEXT_NODE) {
    const offs = indice.desdeNodo.get(nodo);
    return offs ? offs[Math.min(offset, offs.length - 1)] : null;
  }
  const desde = nodo.childNodes[offset] || null;
  const w = document.createTreeWalker(nodo, NodeFilter.SHOW_TEXT);
  if (desde) {
    // El primer texto desde ese hijo en adelante (dentro del mismo elemento).
    w.currentNode = desde;
    let t = desde.nodeType === Node.TEXT_NODE ? desde : w.nextNode();
    while (t && !indice.desdeNodo.has(t)) t = w.nextNode();
    if (t) return indice.desdeNodo.get(t)[0];
  }
  // El límite cae al final del elemento: el final de su último texto.
  let ultimo = null;
  const w2 = document.createTreeWalker(nodo, NodeFilter.SHOW_TEXT);
  while (w2.nextNode()) if (indice.desdeNodo.has(w2.currentNode)) ultimo = w2.currentNode;
  return ultimo ? indice.desdeNodo.get(ultimo).at(-1) : null;
}
function rangoDom(indice, inicio, fin) {
  let a = inicio, b = fin - 1;
  while (a < fin && !indice.mapa[a]) a++;
  while (b >= a && !indice.mapa[b]) b--;
  if (a > b) return null;
  const r = document.createRange();
  r.setStart(indice.mapa[a].n, indice.mapa[a].o);
  r.setEnd(indice.mapa[b].n, indice.mapa[b].o + 1);
  return r;
}
// Envuelve [inicio, fin) del texto en elementos (uno por nodo de texto), de atrás para adelante.
function envolver(indice, inicio, fin, crear) {
  const tramos = [];
  for (let i = inicio; i < fin; i++) {
    const e = indice.mapa[i];
    if (!e) continue;
    const ult = tramos.at(-1);
    if (ult && ult.n === e.n && e.o >= ult.hasta) ult.hasta = e.o + 1;
    else tramos.push({ n: e.n, desde: e.o, hasta: e.o + 1 });
  }
  const hechos = [];
  for (const t of tramos.reverse()) {
    let nodo = t.n;
    if (t.hasta < nodo.data.length) nodo.splitText(t.hasta);
    if (t.desde > 0) nodo = nodo.splitText(t.desde);
    const env = crear();
    nodo.replaceWith(env);
    env.append(nodo);
    hechos.unshift(env);
  }
  return hechos;
}
function resolverMarca(indice, marca) {
  const { normal } = indice;
  const t = marca.texto;
  if (!t) return null;
  const hallados = [];
  for (let k = normal.indexOf(t); k >= 0; k = normal.indexOf(t, k + 1)) hallados.push(k);
  if (!hallados.length) return null;
  let mejor = hallados[0];
  const a = marca.ancla;
  if (a && hallados.length > 1) {
    const puntaje = (i) => {
      let s = 0;
      const antes = normal.slice(Math.max(0, i - a.antes.length), i);
      while (s < antes.length && antes[antes.length - 1 - s] === a.antes[a.antes.length - 1 - s]) s++;
      const despues = normal.slice(i + t.length, i + t.length + a.despues.length);
      let p = 0;
      while (p < despues.length && despues[p] === a.despues[p]) p++;
      return s + p;
    };
    mejor = hallados.reduce((m, i) => {
      const pm = puntaje(m), pi = puntaje(i);
      return pi > pm || (pi === pm && Math.abs(i - a.inicio) < Math.abs(m - a.inicio)) ? i : m;
    });
  }
  return { inicio: mejor, fin: mejor + t.length };
}
const anclaDe = (indice, inicio, fin) => ({ inicio, antes: indice.normal.slice(Math.max(0, inicio - 32), inicio), despues: indice.normal.slice(fin, fin + 32) });

// Repinta todas las marcas y los apuntes de la nota abierta desde los datos (nunca se mueven nodos a mano).
function repintarMarcas() {
  const cuerpo = lector.querySelector(".cuerpo");
  if (!cuerpo) return;
  quitarPropuesta();
  for (const m of cuerpo.querySelectorAll("mark[data-id]")) m.replaceWith(...m.childNodes);
  for (const a of lector.querySelectorAll("aside.apunte, .margen")) a.remove();
  cuerpo.normalize();
  const reg = estado.biblioteca.get(estado.notaAbierta);
  const indice = indiceDeTexto(cuerpo);
  estado.marcasPerdidas = new Set();
  const ubicadas = [];
  let anclasNuevas = false;
  for (const d of reg?.destacados || []) {
    const r = resolverMarca(indice, d);
    if (!r) { estado.marcasPerdidas.add(d.id); continue; }
    if (!d.ancla) { d.ancla = anclaDe(indice, r.inicio, r.fin); anclasNuevas = true; }
    ubicadas.push({ d, inicio: r.inicio, fin: r.fin });
  }
  for (const u of [...ubicadas].sort((a, b) => b.inicio - a.inicio)) {
    const partes = envolver(indice, u.inicio, u.fin, () => {
      const m = el("mark");
      m.dataset.id = u.d.id;
      m.dataset.color = u.d.color;
      return m;
    });
    if (!partes.length) continue;
    partes[0].classList.add("ini");
    partes[0].tabIndex = 0;
    partes[0].setAttribute("aria-describedby", `desc-${u.d.id}`);
    partes.at(-1).classList.add("fin");
    partes.at(-1).classList.toggle("con-apunte", Boolean(u.d.apunte));
  }
  estado.ubicadas = ubicadas.sort((a, b) => a.inicio - b.inicio);
  let desc = lector.querySelector(".descripciones");
  if (!desc) { desc = el("div", "oculto descripciones"); lector.append(desc); }
  desc.replaceChildren(...ubicadas.map((u) => {
    const s = el("span", null, `Marca ${COLOR_SINGULAR[u.d.color]}.${u.d.apunte ? " Con apunte." : ""}`);
    s.id = `desc-${u.d.id}`;
    return s;
  }));
  estado.indice = indiceDeTexto(cuerpo);
  if (anclasNuevas && reg) persistir(reg);
  if (estado.marcaElegida) {
    if (ubicadas.some((u) => u.d.id === estado.marcaElegida)) pintarElegida();
    else estado.marcaElegida = null;
  }
  ubicarApuntes();
}
function marcaPorId(id) {
  return estado.biblioteca.get(estado.notaAbierta)?.destacados.find((d) => d.id === id) || null;
}
function anunciar(texto) { aviso.textContent = ""; requestAnimationFrame(() => { aviso.textContent = texto; }); }

/* --- la propuesta: la frase tocada, en gris, todavía sin guardar --- */
let propuesta = null;      // { inicio, fin } en el texto normalizado
let seleccionGuardada = null;
function mostrarPropuesta(inicio, fin) {
  quitarPropuesta();
  propuesta = { inicio, fin };
  const r = rangoDom(estado.indice, inicio, fin);
  if (!r) return;
  if (window.CSS?.highlights && window.Highlight) {
    CSS.highlights.set("propuesta", new Highlight(r));
  } else {
    envolver(estado.indice, inicio, fin, () => el("mark", "propuesta"));
    estado.indice = indiceDeTexto(lector.querySelector(".cuerpo"));
  }
}
function quitarPropuesta() {
  propuesta = null;
  if (window.CSS?.highlights) CSS.highlights.delete("propuesta");
  const cuerpo = lector.querySelector(".cuerpo");
  const viejas = cuerpo ? cuerpo.querySelectorAll("mark.propuesta") : [];
  if (viejas.length) {
    for (const m of viejas) m.replaceWith(...m.childNodes);
    cuerpo.normalize();
    estado.indice = indiceDeTexto(cuerpo);
  }
}
// La frase bajo el dedo: del punto anterior al siguiente, dentro del mismo párrafo.
const ABREVIATURAS = /(?:\b(?:Sr|Sra|Dr|Dra|Lic|Ing|Gral|Cnel|Av|etc)|[A-ZÁÉÍÓÚÑ])$/;
function fraseEn(indice, p) {
  const { normal, bloqueDe } = indice;
  if (p == null) return null;
  if (p >= normal.length) p = normal.length - 1;
  if (p < 0) return null;
  if (bloqueDe[p] === -1) p = Math.max(0, p - 1);
  const b = bloqueDe[p];
  let ini = p, fin = p;
  while (ini > 0 && bloqueDe[ini - 1] === b) ini--;
  while (fin < normal.length && bloqueDe[fin] === b) fin++;
  const texto = normal.slice(ini, fin);
  const pos = p - ini;
  const cortes = /[.!?…]["”»’)]*(?=\s|$)/g;
  let desde = 0, hasta = texto.length, m;
  while ((m = cortes.exec(texto))) {
    if (m[0][0] === "." && ABREVIATURAS.test(texto.slice(0, m.index))) continue;  // EE.UU., Sr.
    const corte = m.index + m[0].length;
    if (corte <= pos) desde = corte;
    else { hasta = corte; break; }
  }
  while (desde < hasta && texto[desde] === " ") desde++;
  while (hasta > desde && texto[hasta - 1] === " ") hasta--;
  return hasta - desde >= 3 ? { inicio: ini + desde, fin: ini + hasta } : null;
}
function posicionDelToque(x, y) {
  let nodo, offset;
  if (document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(x, y);
    if (!r) return null;
    [nodo, offset] = [r.startContainer, r.startOffset];
  } else if (document.caretPositionFromPoint) {
    const c = document.caretPositionFromPoint(x, y);
    if (!c) return null;
    [nodo, offset] = [c.offsetNode, c.offset];
  } else return null;
  if (nodo.nodeType !== Node.TEXT_NODE || !estado.indice?.desdeNodo.has(nodo)) return null;
  return posicionDe(estado.indice, nodo, offset);
}
// Lo elegido se redondea a palabras enteras.
function aPalabras(normal, a, b) {
  const letra = /[\p{L}\p{N}]/u;
  while (a > 0 && letra.test(normal[a - 1]) && letra.test(normal[a])) a--;
  while (b < normal.length && b > 0 && letra.test(normal[b]) && letra.test(normal[b - 1])) b++;
  // Ni empieza con lo que cierra (", la serie") ni termina en lo que abre o en una coma.
  while (a < b && /[\s,.;:)\]»”’]/u.test(normal[a])) a++;
  while (b > a && /[\s,;:(\[«“‘]/u.test(normal[b - 1])) b--;
  return [a, b];
}

/* --- crear, recolorear y borrar --- */
// Crea (o fusiona) la marca en memoria y la pinta. Sincrónica: el que llama guarda después.
function crearMarca(inicio, fin, color) {
  const reg = registroDe(estado.notaAbierta);
  const indice = estado.indice;
  [inicio, fin] = aPalabras(indice.normal, inicio, fin);
  if (fin - inicio < 2) return null;
  const ubicadas = estado.ubicadas || [];
  const contenedora = ubicadas.find((u) => u.inicio <= inicio && fin <= u.fin);
  if (contenedora) return { marca: contenedora.d, reg, nueva: false };
  const pisadas = ubicadas.filter((u) => u.inicio < fin && inicio < u.fin);
  let a = inicio, b = fin;
  for (const u of pisadas) { a = Math.min(a, u.inicio); b = Math.max(b, u.fin); }
  const ahora = new Date().toISOString();
  let marca;
  if (pisadas.length) {
    // Marcar encima de otras marcas las une en una sola: la más vieja conserva su id, los apuntes se juntan enteros.
    const vieja = [...pisadas].sort((x, y) => x.d.creado.localeCompare(y.d.creado))[0].d;
    const apuntes = [...pisadas].sort((x, y) => x.inicio - y.inicio).map((u) => u.d.apunte).filter(Boolean);
    marca = { ...vieja, texto: indice.normal.slice(a, b), color, apunte: apuntes.join("\n\n"), editado: ahora, ancla: anclaDe(indice, a, b) };
    reg.destacados = reg.destacados.filter((d) => !pisadas.some((u) => u.d.id === d.id));
  } else {
    marca = { id: idNuevoDeMarca(), texto: indice.normal.slice(a, b), color, apunte: "", creado: ahora, editado: null, ancla: anclaDe(indice, a, b) };
  }
  reg.destacados.push(marca);
  // Si marcaste sobre la versión de la edición, la copia guardada pasa a ser esa (la que marcaste).
  if (estado.versionPintada === "edicion" && !estado.marcasPerdidas?.size && estado.notas.has(reg.id)) reg.nota = estado.notas.get(reg.id);
  estado.biblioteca.set(reg.id, reg);
  anularDeshacer();
  getSelection().removeAllRanges();
  seleccionGuardada = null;
  repintarMarcas();
  return { marca, reg, nueva: true };
}
async function marcar(inicio, fin, color) {
  const hecho = crearMarca(inicio, fin, color);
  if (!hecho) return null;
  if (!hecho.nueva) { elegirMarca(hecho.marca.id); return hecho.marca; }
  guardarMemoria("ultimo-color", color);
  await persistir(hecho.reg);
  pedirPersistencia();
  if (!leerMemoria("ya-marco", false)) {
    guardarMemoria("ya-marco", true);
    avisar("Marcado. Lo encontrás en Anotaciones.");
  }
  anunciar(`Marcado en ${color}`);
  return hecho.marca;
}
async function recolorear(id, color) {
  const reg = estado.biblioteca.get(estado.notaAbierta);
  const d = marcaPorId(id);
  if (!reg || !d || d.color === color) return;
  anularDeshacer();
  d.color = color;
  d.editado = new Date().toISOString();
  for (const m of lector.querySelectorAll(`mark[data-id="${id}"], aside.apunte[data-id="${id}"]`)) m.dataset.color = color;
  guardarMemoria("ultimo-color", color);
  await persistir(reg);
  pintarMarcador();
  anunciar(`Color: ${color}`);
}
// Deshacer: una copia de los registros tocados; volver a guardarlos tal cual.
const instantanea = (regs) => regs.filter(Boolean).map((r) => structuredClone(r));
async function restaurar(copias) {
  for (const c of copias) await persistir(c);
  if (estado.notaAbierta && copias.some((c) => c.id === estado.notaAbierta)) repintarMarcas();
  if (!panel.hidden) dibujarPanel();
  pintarBotonesLector();
}
async function borrarMarcaId(id) {
  const reg = estado.biblioteca.get(estado.notaAbierta);
  const d = marcaPorId(id);
  if (!reg || !d) return;
  const copias = instantanea([reg]);
  reg.destacados = reg.destacados.filter((x) => x.id !== id);
  await persistir(reg);
  cerrarMarcador();
  repintarMarcas();
  avisar(d.apunte ? "Borraste la marca y su apunte" : "Borraste la marca", () => restaurar(copias), { duracion: d.apunte ? 10000 : 6000 });
  anunciar("Borraste la marca");
}

/* --- la tira del marcador --- */
let marcadorEstado = null;        // "nueva" | "marca" | "pista"
let scrollAlAbrir = 0, scrollPropio = false;
function pintarElegida() {
  for (const m of lector.querySelectorAll("mark.elegida, aside.apunte.elegido")) m.classList.remove("elegida", "elegido");
  if (!estado.marcaElegida) return;
  for (const m of lector.querySelectorAll(`mark[data-id="${estado.marcaElegida}"]`)) m.classList.add("elegida");
  lector.querySelector(`aside.apunte[data-id="${estado.marcaElegida}"]`)?.classList.add("elegido");
}
function pintarMarcador() {
  const d = marcadorEstado === "marca" ? marcaPorId(estado.marcaElegida) : null;
  const ultimo = leerMemoria("ultimo-color", "amarillo");
  for (const b of marcador.querySelectorAll(".muestra")) {
    const c = b.dataset.color;
    if (marcadorEstado === "marca") {
      b.setAttribute("aria-pressed", String(d?.color === c));
      b.setAttribute("aria-label", `Color ${c}`);
    } else {
      b.removeAttribute("aria-pressed");
      b.setAttribute("aria-label", `Marcar en ${c}`);
    }
    b.classList.toggle("ultimo", marcadorEstado === "nueva" && c === ultimo);
  }
  const escribir = marcador.querySelector(".escribir");
  escribir.setAttribute("aria-label", d?.apunte ? "Editar el apunte" : "Escribir un apunte");
  marcador.querySelector(".cerrar").setAttribute("aria-label", marcadorEstado === "marca" ? "Listo" : "Cancelar");
}
let esperaOcultarMarcador = 0;
function abrirMarcador(estadoTira) {
  marcadorEstado = estadoTira;
  marcador.dataset.estado = estadoTira;
  pintarMarcador();
  clearTimeout(esperaOcultarMarcador);
  marcador.hidden = false;
  requestAnimationFrame(() => marcador.classList.add("visible"));
  const alto = estado.modo === "tableta" ? 72 : 60;
  lector.style.setProperty("--alto-marcador", `calc(${alto}px + var(--seguro-abajo))`);
  lector.classList.add("con-marcador");
  document.documentElement.style.setProperty("--alto-pie", `${marcador.getBoundingClientRect().height || alto}px`);
  scrollAlAbrir = lector.scrollTop;
  // Que lo propuesto o la marca elegida no quede detrás de la tira.
  requestAnimationFrame(() => {
    const elegido = propuesta || seleccionGuardada;
    const objetivo = marcadorEstado === "marca"
      ? lector.querySelector(`mark[data-id="${estado.marcaElegida}"].fin`)
      : elegido && rangoDom(estado.indice, elegido.inicio, elegido.fin);
    const caja = objetivo?.getBoundingClientRect?.();
    // Dónde termina quedando la tira (sin la transición de entrada): alto de la pantalla menos su "bottom" y su alto.
    const tope = document.documentElement.clientHeight - parseFloat(getComputedStyle(marcador).bottom || "0") - marcador.offsetHeight;
    const aire = marcadorEstado === "nueva" && !propuesta && seleccionGuardada ? 72 : 16;   // lejos del menú nativo
    if (caja && caja.bottom > tope - aire) {
      scrollPropio = true;
      lector.scrollTop += caja.bottom - tope + aire;
      scrollAlAbrir = lector.scrollTop;
      setTimeout(() => { scrollPropio = false; }, 80);
    }
  });
}
function cerrarMarcador() {
  if (marcador.hidden && !propuesta && !estado.marcaElegida) return;
  quitarPropuesta();
  marcadorEstado = null;
  estado.marcaElegida = null;
  pintarElegida();
  marcador.classList.remove("visible");
  lector.classList.remove("con-marcador");
  document.documentElement.style.removeProperty("--alto-pie");
  const ocultar = () => { if (!marcador.classList.contains("visible")) marcador.hidden = true; };
  clearTimeout(esperaOcultarMarcador);
  if (reducido.matches) ocultar(); else esperaOcultarMarcador = setTimeout(ocultar, 170);
}
function elegirMarca(id, { conTira = true } = {}) {
  quitarPropuesta();
  estado.marcaElegida = id;
  pintarElegida();
  if (conTira) abrirMarcador("marca");
}
marcador.addEventListener("pointerdown", (ev) => ev.preventDefault());   // que no se pierda la selección nativa
marcador.addEventListener("click", async (ev) => {
  const b = ev.target.closest("button");
  if (!b) return;
  if (b.classList.contains("entendido")) { guardarMemoria("pista-marcar", true); cerrarMarcador(); return; }
  if (b.classList.contains("cerrar")) { const id = estado.marcaElegida; cerrarMarcador(); if (id) lector.querySelector(`mark[data-id="${id}"].ini`)?.focus({ preventScroll: true }); return; }
  if (b.classList.contains("tacho")) { if (estado.marcaElegida) borrarMarcaId(estado.marcaElegida); return; }
  const objetivo = propuesta || seleccionGuardada;
  if (b.classList.contains("muestra")) {
    if (marcadorEstado === "marca") recolorear(estado.marcaElegida, b.dataset.color);
    else if (objetivo) {
      const m = await marcar(objetivo.inicio, objetivo.fin, b.dataset.color);
      if (m) elegirMarca(m.id);
    }
    return;
  }
  if (b.classList.contains("escribir")) {
    if (marcadorEstado === "marca") { abrirApunte(estado.marcaElegida); return; }
    if (!objetivo) return;
    // Marca con el último color y abre el apunte en el mismo toque (si no, el iPhone no saca el teclado).
    const hecho = crearMarca(objetivo.inicio, objetivo.fin, leerMemoria("ultimo-color", "amarillo"));
    if (!hecho) return;
    elegirMarca(hecho.marca.id, { conTira: false });
    abrirApunte(hecho.marca.id);
    if (hecho.nueva) { persistir(hecho.reg); pedirPersistencia(); }
  }
});

// Tocar en el cuerpo: una frase la propone, una marca la elige, un enlace se abre, un apunte se edita.
lector.addEventListener("click", (ev) => {
  const cuerpo = lector.querySelector(".cuerpo");
  if (!cuerpo || ev.target.closest("#marcador")) return;
  const apunte = ev.target.closest("aside.apunte");
  if (apunte) {
    if (!apunte.classList.contains("editando")) {
      if (lector.querySelector("aside.apunte.editando")) cerrarEdicionAlMargen();
      elegirMarca(apunte.dataset.id, { conTira: false });
      abrirApunte(apunte.dataset.id);
    }
    return;
  }
  if (lector.querySelector("aside.apunte.editando") && !ev.target.closest("aside.apunte")) { cerrarEdicionAlMargen(); return; }
  if (!cuerpo.contains(ev.target)) { if (!ev.target.closest(".barra")) cerrarMarcador(); return; }
  if (ev.target.closest("a")) { cerrarMarcador(); return; }
  if (!getSelection().isCollapsed) return;
  const mark = ev.target.closest("mark[data-id]");
  if (mark) { elegirMarca(mark.dataset.id); return; }
  if (!marcador.hidden && marcadorEstado !== "pista") { cerrarMarcador(); return; }   // con la tira abierta, un toque sólo la cierra
  if (marcadorEstado === "pista") guardarMemoria("pista-marcar", true);
  const pos = posicionDelToque(ev.clientX, ev.clientY);
  const f = pos == null ? null : fraseEn(estado.indice, pos);
  if (!f) { cerrarMarcador(); return; }
  mostrarPropuesta(f.inicio, f.fin);
  abrirMarcador("nueva");
});
// Mantener apretado y ajustar las manijas: cuando la selección se queda quieta, la tira apunta a lo elegido.
let esperaSeleccion = 0;
document.addEventListener("selectionchange", () => {
  if (!lector.classList.contains("abierto")) return;
  clearTimeout(esperaSeleccion);
  esperaSeleccion = setTimeout(() => {
    const sel = getSelection();
    const cuerpo = lector.querySelector(".cuerpo");
    if (!cuerpo || !sel.rangeCount || sel.isCollapsed) return;
    if (document.activeElement?.matches?.("input, textarea")) return;
    const r = sel.getRangeAt(0);
    if (!cuerpo.contains(r.commonAncestorContainer) || sel.toString().trim().length < 3) return;
    const a = posicionDe(estado.indice, r.startContainer, r.startOffset);
    const z = posicionDe(estado.indice, r.endContainer, r.endOffset);
    if (a == null || z == null || z - a < 3) return;
    const dentro = (estado.ubicadas || []).find((u) => u.inicio <= a && z <= u.fin);
    if (dentro) { elegirMarca(dentro.d.id); return; }
    quitarPropuesta();
    seleccionGuardada = { inicio: a, fin: z };
    estado.marcaElegida = null;
    pintarElegida();
    abrirMarcador("nueva");
  }, 120);
});
// Desplazarse con la tira abierta la cierra (lo propuesto sin color no se guarda).
lector.addEventListener("scroll", () => {
  if (marcador.hidden || scrollPropio || marcadorEstado === "pista") return;
  if (Math.abs(lector.scrollTop - scrollAlAbrir) > 48 && getSelection().isCollapsed) cerrarMarcador();
}, { passive: true });
// Con teclado: Enter sobre una marca la elige; en la tira, 1-4 color, E escribir, Borrar la borra.
lector.addEventListener("keydown", (ev) => {
  const mark = ev.target.closest?.("mark[data-id]");
  if (mark && (ev.key === "Enter" || ev.key === " ")) {
    ev.preventDefault();
    elegirMarca(mark.dataset.id);
    (marcador.querySelector('.muestra[aria-pressed="true"]') || marcador.querySelector(".muestra")).focus();
  }
});
function teclaDelMarcador(ev) {
  if (marcador.hidden || ev.target.matches?.("input, textarea")) return false;
  const n = "1234".indexOf(ev.key);
  if (n >= 0) { marcador.querySelectorAll(".muestra")[n].click(); return true; }
  if (ev.key === "e" || ev.key === "E") { marcador.querySelector(".escribir").click(); return true; }
  if ((ev.key === "Backspace" || ev.key === "Delete") && marcadorEstado === "marca") { borrarMarcaId(estado.marcaElegida); return true; }
  if (ev.key === "Escape") { marcador.querySelector(".cerrar").click(); return true; }
  return false;
}
let temporizadorPista = 0;
function mostrarPistaSiHaceFalta() {
  if (leerMemoria("pista-marcar", false) || !lector.classList.contains("abierto") || !marcador.hidden || apunteAbierto) return;
  if (!lector.querySelector(".cuerpo")?.textContent.trim()) return;
  abrirMarcador("pista");
}

/* --- apuntes al lado: al margen en el iPad, debajo del párrafo en el teléfono --- */
let modoApunte = "linea";
let observadorCuerpo = null;
function modoDeApuntes() {
  if (estado.modo !== "tableta") return "linea";
  const L = lector.clientWidth;
  if ((L - 680) / 2 - 28 - 16 >= 180) return "colgado";
  const reg = estado.biblioteca.get(estado.notaAbierta);
  const hay = (reg?.destacados || []).some((d) => d.apunte) || Boolean(apunteAbierto);
  return L >= 740 && hay ? "corrido" : "linea";
}
function asideDeApunte(d) {
  const a = el("aside", "apunte");
  a.dataset.id = d.id;
  a.dataset.color = d.color;
  a.setAttribute("role", "button");
  a.tabIndex = 0;
  a.setAttribute("aria-label", `Tu apunte: ${d.apunte.split(/\s+/).slice(0, 12).join(" ")}`);
  a.append(el("span", "texto-apunte", d.apunte));
  a.addEventListener("keydown", (ev) => { if ((ev.key === "Enter" || ev.key === " ") && !a.classList.contains("editando")) { ev.preventDefault(); a.click(); } });
  return a;
}
const ordenEnTexto = (id) => (estado.ubicadas || []).findIndex((u) => u.d.id === id);
function ubicarApuntes() {
  const art = lector.querySelector("article");
  const cuerpo = lector.querySelector(".cuerpo");
  if (!art || !cuerpo) return;
  if (lector.querySelector("aside.apunte.editando")) return;   // mientras escribís al margen no se rearma nada
  // Al cambiar de modo (la columna se corre), la marca de referencia queda en el mismo lugar de la pantalla.
  const ref = lector.querySelector("mark.elegida") || (apunteAbierto && lector.querySelector(`mark[data-id="${apunteAbierto.id}"]`));
  const antes = ref?.getBoundingClientRect().top;
  for (const a of lector.querySelectorAll("aside.apunte, .margen")) a.remove();
  modoApunte = modoDeApuntes();
  art.classList.toggle("colgado", modoApunte === "colgado");
  lector.classList.toggle("corrido", modoApunte === "corrido");
  const conApunte = (estado.ubicadas || []).filter((u) => u.d.apunte);
  if (modoApunte === "linea") {
    for (const u of conApunte) {
      const ult = [...cuerpo.querySelectorAll(`mark[data-id="${u.d.id}"]`)].at(-1);
      if (!ult) continue;
      const a = asideDeApunte(u.d);
      const tabla = ult.closest("table"), figura = ult.closest("figure"), li = ult.closest("li");
      if (li) li.append(a);
      else {
        let ancla = tabla || figura || ult.closest("p, blockquote, h2, h3, h4") || ult;
        while (ancla.nextElementSibling?.matches("aside.apunte")) ancla = ancla.nextElementSibling;
        ancla.after(a);
      }
    }
  } else {
    const margen = el("div", "margen");
    margen.setAttribute("aria-label", "Tus apuntes");
    art.append(margen);
    for (const u of conApunte) margen.append(asideDeApunte(u.d));
    acomodarMargen();
  }
  if (ref && antes != null) lector.scrollTop += ref.getBoundingClientRect().top - antes;
  pintarElegida();
}
// En el margen, cada apunte arranca a la altura del primer renglón de su marca y nunca pisa al de arriba.
function acomodarMargen() {
  const art = lector.querySelector("article");
  const margen = art?.querySelector(".margen");
  if (!margen) return;
  const base = art.getBoundingClientRect().top;
  let piso = -Infinity;
  for (const a of margen.querySelectorAll("aside.apunte")) {
    const ini = lector.querySelector(`mark[data-id="${a.dataset.id}"].ini`);
    const rect = ini?.getClientRects()[0];
    if (!rect) { a.hidden = true; continue; }
    a.hidden = false;
    const top = Math.max(rect.top - base, piso);
    a.style.top = `${top}px`;
    piso = top + a.offsetHeight + 12;
  }
}
let esperaAcomodo = 0;
function reacomodarApuntes() {
  cancelAnimationFrame(esperaAcomodo);
  esperaAcomodo = requestAnimationFrame(() => {
    if (!lector.classList.contains("abierto")) return;
    if (apunteAbierto && !hojaApunte.hidden) return;   // la hoja a pantalla completa no depende del ancho
    if (modoDeApuntes() !== modoApunte) {
      // Al girar o pasar a Split View: lo que estás escribiendo al margen se guarda y se rearma en el modo nuevo.
      if (lector.querySelector("aside.apunte.editando")) cerrarEdicionAlMargen();
      else ubicarApuntes();
    } else acomodarMargen();
  });
}
addEventListener("resize", reacomodarApuntes);
document.fonts?.ready.then(reacomodarApuntes);

/* --- escribir el apunte --- */
let esperaGuardado = 0;
let apunteAbierto = null;   // { id }
let abridorApunte = null;
let inertesApunte = [];
const LIMITE_APUNTE = 1000;
function cajaDelApunte() {
  if (!apunteAbierto) return null;
  return !hojaApunte.hidden ? hojaApunte.querySelector("textarea")
    : lector.querySelector(`aside.apunte.editando[data-id="${apunteAbierto.id}"] textarea`);
}
function guardarApunteYa() {
  clearTimeout(esperaGuardado);
  const caja = cajaDelApunte();
  if (!caja) return;
  const reg = estado.biblioteca.get(estado.notaAbierta);
  const d = marcaPorId(apunteAbierto.id);
  if (!reg || !d) return;
  // Un apunte que viene de fusionar puede pasar los 1000: nunca se recorta lo que ya estaba.
  const texto = caja.value.slice(0, Math.max(LIMITE_APUNTE, d.apunte.length)).replace(/\s+$/, "");
  if (texto === d.apunte) return;
  anularDeshacer();
  d.apunte = texto;
  d.editado = new Date().toISOString();
  persistir(reg);
}
function contarQuedan(caja, salida) {
  const quedan = caja.maxLength - caja.value.length;
  salida.textContent = quedan <= 100 ? `Quedan ${Math.max(0, quedan)}` : "";
}
function abrirApunte(id, provisoria = null) {
  const d = provisoria || marcaPorId(id);
  if (!d) return;
  if (apunteAbierto && apunteAbierto.id !== id) { if (!hojaApunte.hidden) cerrarApunte(); else cerrarEdicionAlMargen(); }
  abridorApunte = document.activeElement;
  apunteAbierto = { id };
  clearTimeout(temporizadorPista);
  marcador.hidden = true;
  marcador.classList.remove("visible");
  lector.classList.remove("con-marcador");
  if (modoDeApuntes() === "linea") {
    modoApunte = "linea";
    const caja = hojaApunte.querySelector("textarea");
    const frase = hojaApunte.querySelector(".frase");
    frase.textContent = d.texto;
    frase.dataset.color = d.color;
    hojaApunte.querySelector(".borrar-apunte").hidden = !d.apunte;
    caja.maxLength = Math.max(LIMITE_APUNTE, d.apunte.length);
    caja.value = d.apunte;
    contarQuedan(caja, hojaApunte.querySelector(".quedan"));
    hojaApunte.hidden = false;
    caja.focus();   // en el mismo toque: así el iPhone saca el teclado
    requestAnimationFrame(() => hojaApunte.classList.add("abierta"));
    // La hoja atrapa el foco: todo lo de atrás queda inerte mientras escribís.
    inertesApunte = [...document.body.children].filter((n) => n !== hojaApunte && !n.inert);
    for (const n of inertesApunte) n.inert = true;
  } else {
    editarAlMargen(d);
  }
}
function soltarInertesApunte() {
  for (const n of inertesApunte) n.inert = false;
  inertesApunte = [];
  // El lector sigue tapando lo de abajo como siempre.
  if (lector.classList.contains("abierto")) for (const n of [libro, recorrido, indiceBoton, chipFiltro, panel]) n.inert = true;
}
function cerrarApunte() {
  guardarApunteYa();
  const id = apunteAbierto?.id;
  apunteAbierto = null;
  hojaApunte.classList.remove("abierta");
  hojaApunte.hidden = true;
  soltarInertesApunte();
  repintarMarcas();
  if (id) { estado.marcaElegida = id; pintarElegida(); }
  const volver = id && lector.querySelector(`mark[data-id="${id}"].ini`);
  (volver || abridorApunte)?.focus?.({ preventScroll: true });
}
hojaApunte.querySelector(".listo").addEventListener("click", cerrarApunte);
hojaApunte.querySelector("textarea").addEventListener("input", (ev) => {
  contarQuedan(ev.target, hojaApunte.querySelector(".quedan"));
  clearTimeout(esperaGuardado);
  esperaGuardado = setTimeout(guardarApunteYa, 400);
});
hojaApunte.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" || (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey))) { ev.preventDefault(); ev.stopPropagation(); cerrarApunte(); }
});
async function borrarApunte(id) {
  const reg = estado.biblioteca.get(estado.notaAbierta);
  const d = marcaPorId(id);
  if (!reg || !d) return;
  const copias = instantanea([reg]);
  d.apunte = "";
  d.editado = new Date().toISOString();
  await persistir(reg);
  avisar("Borraste el apunte", () => restaurar(copias), { duracion: 10000 });
}
hojaApunte.querySelector(".borrar-apunte").addEventListener("click", async () => {
  const id = apunteAbierto?.id;
  clearTimeout(esperaGuardado);
  hojaApunte.querySelector("textarea").value = "";
  apunteAbierto = null;
  hojaApunte.classList.remove("abierta");
  hojaApunte.hidden = true;
  soltarInertesApunte();
  if (id) await borrarApunte(id);
  repintarMarcas();
  if (id) lector.querySelector(`mark[data-id="${id}"].ini`)?.focus({ preventScroll: true });
});
// En el iPad: el apunte se escribe ahí mismo, en el margen.
function editarAlMargen(d) {
  if (modoDeApuntes() !== modoApunte) ubicarApuntes();   // el primer apunte corre la columna (una sola vez, anclada)
  const cuerpo = lector.querySelector(".cuerpo");
  const ini = cuerpo.querySelector(`mark[data-id="${d.id}"].ini`);
  if (ini) lector.scrollTop += ini.getBoundingClientRect().top - lector.clientHeight * 0.25;
  let a = lector.querySelector(`aside.apunte[data-id="${d.id}"]`);
  if (!a) {
    let margen = lector.querySelector(".margen");
    if (!margen) { margen = el("div", "margen"); lector.querySelector("article").append(margen); }
    a = asideDeApunte(d);
    // En el orden del texto: al lado de su marca, no al final del margen.
    margen.insertBefore(a, [...margen.children].find((x) => ordenEnTexto(x.dataset.id) > ordenEnTexto(d.id)) || null);
  }
  a.classList.add("editando");
  a.removeAttribute("role");
  a.removeAttribute("aria-label");
  a.replaceChildren();
  const caja = el("textarea");
  caja.maxLength = Math.max(LIMITE_APUNTE, d.apunte.length);
  caja.value = d.apunte;
  caja.placeholder = "Escribí lo que quieras al lado de esta frase.";
  caja.setAttribute("aria-label", "Tu apunte");
  const quedan = el("p", "quedan");
  const acciones = el("div", "acciones-apunte");
  const listo = el("button", "listo", "Listo");
  listo.type = "button";
  listo.addEventListener("click", (ev) => { ev.stopPropagation(); cerrarEdicionAlMargen(); });
  acciones.append(listo);
  if (d.apunte) {
    const borrar = el("button", "borrar-apunte", "Borrar apunte");
    borrar.type = "button";
    borrar.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      clearTimeout(esperaGuardado);
      caja.value = "";
      const id = d.id;
      apunteAbierto = null;
      a.classList.remove("editando");
      await borrarApunte(id);
      repintarMarcas();
      lector.querySelector(`mark[data-id="${id}"].ini`)?.focus({ preventScroll: true });
    });
    acciones.append(borrar);
  }
  a.append(caja, quedan, acciones);
  const crecer = () => { caja.style.height = "auto"; caja.style.height = `${Math.max(88, caja.scrollHeight)}px`; acomodarMargen(); };
  caja.addEventListener("input", () => { crecer(); contarQuedan(caja, quedan); clearTimeout(esperaGuardado); esperaGuardado = setTimeout(guardarApunteYa, 400); });
  // Esc (o ⌘↩) cierra sólo la tarjeta, esté el foco en el texto o en sus botones; nunca la nota entera.
  a.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" || (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey))) { ev.preventDefault(); ev.stopPropagation(); cerrarEdicionAlMargen(); }
  });
  acomodarMargen();
  caja.focus();
  crecer();
}
function cerrarEdicionAlMargen() {
  guardarApunteYa();
  const a = lector.querySelector("aside.apunte.editando");
  const id = a?.dataset.id || apunteAbierto?.id;
  apunteAbierto = null;
  for (const x of lector.querySelectorAll("aside.apunte.editando")) x.classList.remove("editando");
  repintarMarcas();
  if (id) {
    estado.marcaElegida = id;
    pintarElegida();
    lector.querySelector(`mark[data-id="${id}"].ini`)?.focus({ preventScroll: true });
  }
}
visualViewport?.addEventListener("resize", () => {
  const caja = lector.querySelector("aside.apunte.editando textarea");
  if (caja && document.activeElement === caja) caja.scrollIntoView({ block: "nearest" });
});

/* ---------- leer más tarde: sin aviso al teléfono, el recordatorio aparece al abrir el diario ---------- */
let notaParaTarde = null;
function opcionesDeTarde() {
  const ahora = new Date();
  const a = (dias, h) => { const d = new Date(ahora); d.setDate(d.getDate() + dias); d.setHours(h, 0, 0, 0); return d; };
  const opciones = [["En una hora", new Date(ahora.getTime() + 3600e3)]];
  if (ahora.getHours() < 20) opciones.push(["Esta noche, 21 h", a(0, 21)]);
  else opciones.push(["Mañana al mediodía, 13 h", a(1, 13)]);
  opciones.push(["Mañana a la mañana, 8 h", a(1, 8)]);
  return opciones;
}
let abridorTarde = null, cierreTarde = 0;
function abrirHojita(idOIds) {
  clearTimeout(cierreTarde);
  abridorTarde = document.activeElement;
  const ids = Array.isArray(idOIds) ? idOIds : [idOIds];
  notaParaTarde = ids[0];
  hojitaTarde.querySelector("h2").textContent = ids.length > 1 ? "¿Cuándo te las recuerdo?" : "¿Cuándo te la recuerdo?";
  const caja = hojitaTarde.querySelector(".opciones");
  caja.replaceChildren();
  const reg = Array.isArray(idOIds) ? null : estado.biblioteca.get(ids[0]);
  for (const [texto, cuando] of opcionesDeTarde()) {
    const b = el("button", null, texto);
    b.type = "button";
    b.addEventListener("click", async () => {
      for (const id of ids) {
        const r = estado.biblioteca.get(id) || registroDe(id);
        r.masTarde = cuando.toISOString();
        r.avisado = false;
        await persistir(r);
      }
      cerrarHojita();
      pintarBotonesLector();
      if (!panel.hidden) { eligiendo = false; elegidas.clear(); dibujarPanel(); }
      avisar(`Te ${ids.length > 1 ? "las" : "la"} recuerdo después de las ${horaFmt.format(cuando)}`);
    });
    caja.append(b);
  }
  if (reg?.masTarde) {
    const q = el("button", "quitar", "Ya no, sacarla de la lista");
    q.type = "button";
    q.addEventListener("click", async () => { cerrarHojita(); await quitarDeMasTarde([reg.id]); pintarBotonesLector(); if (!panel.hidden) dibujarPanel(); });
    caja.append(q);
  }
  hojitaTarde.hidden = false;
  requestAnimationFrame(() => hojitaTarde.classList.add("abierta"));
  caja.querySelector("button").focus();
}
function cerrarHojita() {
  hojitaTarde.classList.remove("abierta");
  cierreTarde = setTimeout(() => { hojitaTarde.hidden = true; }, 260);
  if (abridorTarde?.isConnected) abridorTarde.focus({ preventScroll: true });
}
hojitaTarde.querySelector(".cancelar").addEventListener("click", cerrarHojita);
hojitaTarde.addEventListener("click", (ev) => { if (ev.target === hojitaTarde) cerrarHojita(); });

const botonRecordatorio = document.getElementById("recordatorio");
const porAvisar = new Set();  // vencidas de esta sesión que todavía no abriste desde el aviso
function revisarRecordatorios() {
  const ahora = Date.now();
  const nuevas = [...estado.biblioteca.values()].filter((r) => r.masTarde && new Date(r.masTarde).getTime() <= ahora && !r.avisado);
  if (!nuevas.length || document.hidden) return;
  for (const r of nuevas) porAvisar.add(r.id);
  const vencidas = [...porAvisar].map((id) => estado.biblioteca.get(id)).filter((r) => r?.masTarde);
  if (!vencidas.length) return;
  botonRecordatorio.replaceChildren(
    el("span", "titulo", vencidas.length === 1 ? `Para leer ahora: ${vencidas[0].nota.titulo}` : `Tenés ${vencidas.length} notas para leer ahora`),
    el("span", null, "· Abrir"));
  botonRecordatorio.dataset.ids = vencidas.map((r) => r.id).join(",");
  botonRecordatorio.hidden = false;
  requestAnimationFrame(() => botonRecordatorio.classList.add("visible"));
  for (const r of nuevas) { r.avisado = true; persistir(r); }
}
botonRecordatorio.addEventListener("click", () => {
  const ids = botonRecordatorio.dataset.ids.split(",");
  porAvisar.clear();
  botonRecordatorio.classList.remove("visible");
  setTimeout(() => { botonRecordatorio.hidden = true; }, 450);
  if (ids.length === 1) abrirNota(ids[0]);
  else abrirPanel("tarde");
});

/* ---------- avisos de último momento (Web Push) ---------- */
// Clave pública VAPID: la privada es un secreto de GitHub; con ella la tarea de la edición firma los avisos.
const VAPID_PUBLICA = "BEAuy97f12ImsIJ34T4Uh1GlZhJAUurCnv3ZhKLsBPU5CNA7MXR2tJV-Q9utYGsxcT7xj5gJIfnyddSM_F-EcHs";
const hojitaAvisos = document.getElementById("avisos");
const desdeBase64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
const esIpad = () => /iPad/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const instalada = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

async function suscripcionActual() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}
function mostrarCodigo(sub) {
  const codigo = hojitaAvisos.querySelector(".codigo");
  codigo.querySelector("textarea").value = JSON.stringify(sub.toJSON());
  codigo.querySelector(".nombre-secreto").textContent = esIpad() ? "AVISOS_IPAD" : "AVISOS_IPHONE";
  codigo.hidden = false;
}
async function pintarAvisos() {
  const estadoTexto = hojitaAvisos.querySelector(".estado");
  const opciones = hojitaAvisos.querySelector(".caja > .opciones");
  opciones.replaceChildren();
  hojitaAvisos.querySelector(".codigo").hidden = true;
  const boton = (texto, accion, clase) => {
    const b = el("button", clase || null, texto);
    b.type = "button";
    b.addEventListener("click", accion);
    opciones.append(b);
  };
  if (!("Notification" in window) || !("PushManager" in window) || !instalada()) {
    estadoTexto.textContent = "Para recibir avisos, abrí el diario desde su ícono en la pantalla de inicio: desde Safari no se puede.";
    return;
  }
  if (Notification.permission === "denied") {
    estadoTexto.textContent = "Los avisos están bloqueados para el diario. Activalos en Ajustes › Notificaciones › el pelado.";
    return;
  }
  const sub = await suscripcionActual().catch(() => null);
  if (sub) {
    estadoTexto.textContent = "Activados en este equipo.";
    boton("Ver el código para GitHub", () => mostrarCodigo(sub));
    boton("Desactivar en este equipo", async () => { await sub.unsubscribe().catch(() => {}); avisar("Avisos desactivados en este equipo"); pintarAvisos(); }, "quitar");
  } else {
    estadoTexto.textContent = "";
    boton("Activar avisos en este equipo", activarAvisos);
  }
}
async function activarAvisos() {
  const estadoTexto = hojitaAvisos.querySelector(".estado");
  try {
    if (await Notification.requestPermission() !== "granted") {
      estadoTexto.textContent = "Sin permiso no te pueden llegar avisos. Podés darlo en Ajustes › Notificaciones › el pelado.";
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: desdeBase64url(VAPID_PUBLICA) });
    await pintarAvisos();
    mostrarCodigo(sub);
  } catch {
    estadoTexto.textContent = "No se pudieron activar los avisos en este equipo. Probá de nuevo en un rato.";
  }
}
function abrirAvisos() {
  cerrarIndice();
  hojitaAvisos.hidden = false;
  requestAnimationFrame(() => hojitaAvisos.classList.add("abierta"));
  pintarAvisos().then(() => (hojitaAvisos.querySelector(".caja > .opciones button") || hojitaAvisos.querySelector(".cancelar")).focus());
}
function cerrarAvisos() {
  hojitaAvisos.classList.remove("abierta");
  indiceBoton.focus({ preventScroll: true });
  setTimeout(() => { hojitaAvisos.hidden = true; }, 260);
}
hojitaAvisos.querySelector(".cancelar").addEventListener("click", cerrarAvisos);
hojitaAvisos.addEventListener("click", (ev) => { if (ev.target === hojitaAvisos) cerrarAvisos(); });
hojitaAvisos.querySelector(".copiar").addEventListener("click", async () => {
  const texto = hojitaAvisos.querySelector("textarea").value;
  try { await navigator.clipboard.writeText(texto); avisar("Código copiado: pegalo en GitHub"); }
  catch { hojitaAvisos.querySelector("textarea").select(); avisar("Seleccioná el código y copialo"); }
});

// Tocar un aviso con el diario abierto: si la nota es de una edición más nueva, se trae y se abre.
async function abrirDesdeAviso(id) {
  if (!estado.edicion || !id) return;
  if (!notaPorId(id) && estado.clave) {
    try {
      const nueva = await abrirSobre(await traerSobre(), estado.clave);
      if (nueva.generada !== estado.edicion.generada) {
        montar(nueva);
        estado.modo = "";
        rearmar(true);
        botonNueva.hidden = true;
      }
    } catch { /* sin señal: se abre lo que haya */ }
  }
  if (!notaPorId(id)) return;
  if (!panel.hidden) cerrarPanel();
  if (!indice.hidden) cerrarIndice();
  abrirNota(id);
}
navigator.serviceWorker?.addEventListener("message", (ev) => { if (ev.data && "abrirNota" in ev.data) abrirDesdeAviso(ev.data.abrirNota); });

/* ---------- marcas de una nota, en el orden del texto ---------- */
function marcasEnOrden(reg, filtro = null) {
  return [...(reg?.destacados || [])]
    .filter((d) => !filtro || d.color === filtro)
    .sort((a, b) => (a.ancla?.inicio ?? Infinity) - (b.ancla?.inicio ?? Infinity) || a.creado.localeCompare(b.creado));
}
// Las marcas que no aparecen ni en la nota de la edición ni en la copia guardada.
function marcasPerdidasDe(reg) {
  const fuentes = [...new Set([reg.nota?.cuerpo_html, estado.notas.get(reg.id)?.cuerpo_html].filter(Boolean))];
  const indices = fuentes.map((html) => {
    const raiz = document.createElement("div");
    raiz.append(...limpiarCuerpo(html, null, reg.nota.url).childNodes);
    return indiceDeTexto(raiz);
  });
  return new Set(reg.destacados.filter((d) => !indices.some((ix) => resolverMarca(ix, d))).map((d) => d.id));
}
function bajadaSinRepetir(n) {
  const plano = (t) => (t || "").replace(/\s+/g, " ").trim().toLowerCase();
  return n.bajada && !plano(textoPlano(n.cuerpo_html || "")).slice(0, 400).startsWith(plano(n.bajada).slice(0, 80)) ? n.bajada : "";
}

/* ---------- compartir: una o varias notas, por mail, por la hoja de iOS o para Claude ---------- */
function bloqueDeNota(reg, completo, { filtro = null, conColor = false } = {}) {
  const n = reg.nota;
  const fecha = diaFmt.format(new Date(n.publicada || n.fecha || reg.guardada || Date.now()));
  const marcas = marcasEnOrden(reg, filtro);
  const lineas = marcas.map((d) => [`- «${d.texto}»${conColor ? ` [${d.color}]` : ""}`,
    ...(d.apunte ? [`  Mi apunte: ${d.apunte.replace(/\n/g, "\n  ")}`] : [])].join("\n"));
  const marcado = marcas.length ? `Lo que marqué:\n${lineas.join("\n")}` : "";
  if (!completo) return [n.titulo, `${reg.medio.nombre} · ${fecha}`, marcado, n.url].filter(Boolean).join("\n");
  return [`# ${n.titulo}`, `${reg.medio.nombre} · ${fecha} · ${n.url}`, bajadaSinRepetir(n), textoPlano(n.cuerpo_html || ""), marcado]
    .filter(Boolean).join("\n\n");
}
async function compartir(ids, como, { filtro = null } = {}) {
  const regs = ids.map((id) => estado.biblioteca.get(id) || registroDe(id));
  const completo = como === "claude";
  const colores = new Set(regs.flatMap((r) => marcasEnOrden(r, filtro).map((d) => d.color)));
  const opciones = { filtro, conColor: colores.size > 1 };
  const texto = regs.map((r) => bloqueDeNota(r, completo, opciones)).join(completo ? "\n\n---\n\n" : "\n\n———\n\n");
  const asunto = regs.length === 1 ? regs[0].nota.titulo : `${regs.length} notas de el diario del pelado`;
  if (como === "mail") {
    location.href = `mailto:?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto)}`;
    return;
  }
  const datos = regs.length === 1 && !completo
    ? { title: asunto, text: bloqueDeNota(regs[0], false, opciones).replace(`\n${regs[0].nota.url}`, ""), url: regs[0].nota.url }
    : { title: asunto, text: texto };
  try {
    if (navigator.share) { await navigator.share(datos); return; }
    throw new Error("sin share");
  } catch (err) {
    if (err?.name === "AbortError") return;  // cerraste el menú de compartir
    try {
      await navigator.clipboard.writeText(datos.url ? `${datos.text}\n${datos.url}` : datos.text);
      avisar(completo ? "Copiado: pegalo en Claude" : "Copiado para compartir");
    } catch { avisar("No se pudo compartir desde acá"); }
  }
}
const hojitaCompartir = document.getElementById("compartir");
let compartirPendiente = null, abridorCompartir = null;
let cierreCompartir = 0, inertesHojita = [];
// Una hojita abierta deja inerte todo lo de atrás (panel, lector, portada): el foco no se escapa.
function atraparFoco(hojita) {
  inertesHojita = [...document.body.children].filter((n) => n !== hojita && n !== toast && !n.inert);
  for (const n of inertesHojita) n.inert = true;
}
function soltarFoco() {
  for (const n of inertesHojita) n.inert = false;
  inertesHojita = [];
}
function abrirCompartir(ids, opciones = {}) {
  clearTimeout(cierreCompartir);
  compartirPendiente = { ids, opciones };
  abridorCompartir = document.activeElement;
  atraparFoco(hojitaCompartir);
  hojitaCompartir.querySelector("h2").textContent = ids.length === 1 ? "Compartir la nota" : `Compartir ${ids.length} notas`;
  hojitaCompartir.hidden = false;
  requestAnimationFrame(() => hojitaCompartir.classList.add("abierta"));
  hojitaCompartir.querySelector(".opciones button").focus();
}
function cerrarCompartir() {
  hojitaCompartir.classList.remove("abierta");
  soltarFoco();
  cierreCompartir = setTimeout(() => { hojitaCompartir.hidden = true; }, 260);
  abridorCompartir?.focus?.({ preventScroll: true });
}
for (const b of hojitaCompartir.querySelectorAll("[data-como]")) {
  b.addEventListener("click", async () => {
    const p = compartirPendiente;
    cerrarCompartir();
    if (p) await compartir(p.ids, b.dataset.como, p.opciones);
  });
}
hojitaCompartir.querySelector(".cancelar").addEventListener("click", cerrarCompartir);
hojitaCompartir.addEventListener("click", (ev) => { if (ev.target === hojitaCompartir) cerrarCompartir(); });

/* ---------- exportar en PDF: se arma en el equipo (jsPDF vendorizado) y se entrega por la hoja de compartir ---------- */
let cargaPdf = null;
function cargarPdf() {
  if (!cargaPdf) {
    cargaPdf = new Promise((ok, mal) => {
      if (window.diarioPdf) return ok();
      const s = document.createElement("script");
      s.src = "pdf.js";
      s.onload = ok;
      s.onerror = () => mal(new Error("No se pudo cargar el generador de PDF"));
      document.head.append(s);
    }).then(() => window.diarioPdf.cargar());
    cargaPdf.catch(() => { cargaPdf = null; });
  }
  return cargaPdf;
}
const precalentarPdf = () => { cargarPdf().catch(() => {}); };
// La nota en bloques con sus tramos (negrita, itálica, marca, enlace): lo que dibuja pdf.js en "Nota completa".
function bloquesParaPdf(nota, marcas) {
  const raiz = document.createElement("div");
  raiz.append(...limpiarCuerpo(nota.cuerpo_html || "", nota.foto, nota.url).childNodes);
  for (const x of raiz.querySelectorAll("img, picture, video, iframe, svg")) x.remove();
  const indice = indiceDeTexto(raiz);
  const ubicadas = [], perdidas = [];
  for (const d of marcas) {
    const r = resolverMarca(indice, d);
    if (r) ubicadas.push({ d, ...r }); else perdidas.push(d);
  }
  for (const u of [...ubicadas].sort((a, b) => b.inicio - a.inicio)) {
    envolver(indice, u.inicio, u.fin, () => { const m = document.createElement("mark"); m.dataset.color = u.d.color; m.dataset.id = u.d.id; return m; });
  }
  const TIPOS = "p, h2, h3, h4, blockquote, li, tr, figcaption";
  const elementos = [...raiz.querySelectorAll(TIPOS)].filter((e) => !e.parentElement.closest("blockquote, li, tr, figcaption") || e.matches("li") && !e.parentElement.closest("blockquote, tr"));
  const tramosDe = (elemento) => {
    const tramos = [];
    const w = document.createTreeWalker(elemento, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const nodo = w.currentNode;
      if (nodo.parentElement.closest("ul, ol") !== elemento.closest("ul, ol") && elemento.matches("li") && nodo.parentElement.closest("li") !== elemento) continue;
      const t = nodo.data.replace(/\s+/g, " ");
      if (!t) continue;
      const p = nodo.parentElement;
      const tramo = { t, negrita: Boolean(p.closest("strong, b")), italica: Boolean(p.closest("em, i")), marca: p.closest("mark[data-color]")?.dataset.color || null, href: p.closest("a")?.href || "" };
      const ult = tramos.at(-1);
      if (ult && ult.negrita === tramo.negrita && ult.italica === tramo.italica && ult.marca === tramo.marca && ult.href === tramo.href) ult.t += t;
      else tramos.push(tramo);
    }
    if (tramos.length) { tramos[0].t = tramos[0].t.replace(/^ /, ""); tramos.at(-1).t = tramos.at(-1).t.replace(/ $/, ""); }
    return tramos.filter((x) => x.t);
  };
  const apuntesDe = new Map();
  for (const u of ubicadas.sort((a, b) => a.inicio - b.inicio)) {
    if (!u.d.apunte) continue;
    const ult = [...raiz.querySelectorAll(`mark[data-id="${u.d.id}"]`)].at(-1);
    const bloque = ult && elementos.find((e) => e.contains(ult));
    if (!bloque) { perdidas.push(u.d); continue; }
    if (!apuntesDe.has(bloque)) apuntesDe.set(bloque, []);
    apuntesDe.get(bloque).push({ texto: u.d.apunte, color: u.d.color });
  }
  const bloques = [];
  for (const e of elementos) {
    const apuntes = apuntesDe.get(e);
    let b;
    if (e.matches("tr")) b = { tipo: "fila", celdas: [...e.children].map((c) => c.textContent.replace(/\s+/g, " ").trim()).filter(Boolean) };
    else if (e.matches("figcaption")) { if (!e.querySelector("mark")) continue; b = { tipo: "epigrafe", tramos: tramosDe(e) }; }
    else if (e.matches("li")) {
      const lista = e.parentElement;
      const n = [...lista.children].filter((x) => x.matches("li")).indexOf(e) + 1;
      b = { tipo: "li", marcador: lista.matches("ol") ? `${n}.` : "•", tramos: tramosDe(e) };
    } else b = { tipo: e.matches("h2, h3, h4") ? "h" : e.matches("blockquote") ? "cita" : "p", tramos: tramosDe(e) };
    if ((b.tramos && !b.tramos.length) || (b.celdas && !b.celdas.length)) continue;
    if (apuntes) b.apuntes = apuntes;
    bloques.push(b);
  }
  return { bloques, perdidas };
}
function modeloPdf(ids, modo, filtro) {
  const notas = [];
  for (const id of ids) {
    const reg = estado.biblioteca.get(id) || registroDe(id);
    const n = reg.nota || notaPorId(id);
    if (!n) continue;
    const marcas = marcasEnOrden(reg, filtro);
    if (modo === "marcas" && !marcas.length) continue;
    const medio = { nombre: reg.medio.nombre, letra: reg.medio.linea.letra, color: reg.medio.linea.color, tinta: reg.medio.linea.tinta };
    const base = { titulo: n.titulo, bajada: bajadaSinRepetir(n), autor: n.autor || "", fecha: n.publicada || n.fecha || "", minutos: n.minutos || 0, url: n.url, a_medias: Boolean(n.a_medias), medio };
    if (modo === "marcas") {
      // Las marcas que ya no están en el texto también salen (su texto está guardado).
      notas.push({ ...base, marcas: marcas.map((d) => ({ texto: d.texto, color: d.color, apunte: d.apunte })), perdidas: [], bloques: [] });
    } else {
      const { bloques, perdidas } = bloquesParaPdf(n, marcas);
      notas.push({ ...base, marcas: [], perdidas: perdidas.map((d) => ({ texto: d.texto, color: d.color, apunte: d.apunte })), bloques });
    }
  }
  // Hora local, no UTC: a las 21 de Córdoba el pie ya diría el día siguiente.
  const ahora = new Date();
  return { exportado: new Date(ahora - ahora.getTimezoneOffset() * 60000).toISOString().slice(0, 19), notas };
}
function nombreDePdf(modelo, modo) {
  const limpio = (t) => {
    let x = t.normalize("NFC").replace(/[\/\\:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
    if (x.length > 60) x = x.slice(0, 60).replace(/\s+\S*$/, "");
    return x;
  };
  const hoy = new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
  if (modelo.notas.length === 1) return `${modo === "marcas" ? "Marcas - " : ""}${limpio(modelo.notas[0].titulo)}.pdf`;
  return `${modo === "marcas" ? "Marcas - " : ""}${modelo.notas.length} notas - ${hoy}.pdf`;
}
const hojitaExportar = document.getElementById("exportar");
let exportacion = null, abridorExportar = null, cierreExportar = 0;
function abrirExportar(ids, { filtro = null } = {}) {
  clearTimeout(cierreExportar);
  abridorExportar = document.activeElement;
  atraparFoco(hojitaExportar);
  hojitaExportar.querySelector(".cancelar").textContent = "Cancelar";
  exportacion = { ids, filtro, archivo: null };
  precalentarPdf();
  const conMarcas = ids.some((id) => marcasEnOrden(estado.biblioteca.get(id), filtro).length);
  hojitaExportar.querySelector("h2").textContent = ids.length === 1 ? "Exportar en PDF" : `Exportar ${ids.length} notas en PDF`;
  const marcas = hojitaExportar.querySelector('[data-modo="marcas"]');
  marcas.disabled = !conMarcas;
  marcas.querySelector("span").textContent = conMarcas ? "Como se ve acá: el título y lo que marcaste, con tus apuntes." : "Ninguna de estas notas tiene marcas.";
  const filtrada = hojitaExportar.querySelector(".filtrada");
  filtrada.hidden = !filtro;
  if (filtro) filtrada.textContent = `Sólo las marcas ${COLOR_PLURAL[filtro]}, como en el filtro.`;
  hojitaExportar.querySelector(".estado-pdf").textContent = "";
  hojitaExportar.querySelector(".compartir-pdf").hidden = true;
  for (const b of hojitaExportar.querySelectorAll("[data-modo]")) b.classList.remove("trabajando");
  hojitaExportar.hidden = false;
  requestAnimationFrame(() => hojitaExportar.classList.add("abierta"));
  if (!conMarcas) { hojitaExportar.querySelector(".cancelar").focus(); armarPdf("completa", performance.now()); }   // una sola opción: directo
  else marcas.focus();
}
function cerrarExportar() {
  hojitaExportar.classList.remove("abierta");
  soltarFoco();
  cierreExportar = setTimeout(() => { hojitaExportar.hidden = true; }, 260);
  exportacion = null;
  abridorExportar?.focus?.({ preventScroll: true });
}
async function entregarPdf(archivo) {
  if (exportacion?.archivo !== archivo) return;
  if (navigator.canShare?.({ files: [archivo] })) { await navigator.share({ files: [archivo] }); return; }
  if (!instalada()) {   // en la compu: se descarga
    const a = el("a");
    a.href = URL.createObjectURL(archivo);
    a.download = archivo.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return;
  }
  throw Object.assign(new Error("sin compartir"), { name: "NotAllowedError" });
}
async function armarPdf(modo, t0) {
  const exp = exportacion;
  if (!exp) return;
  const estadoTexto = hojitaExportar.querySelector(".estado-pdf");
  const boton = hojitaExportar.querySelector(`[data-modo="${modo}"]`);
  for (const b of hojitaExportar.querySelectorAll("[data-modo]")) b.disabled = true;
  boton.classList.add("trabajando");
  estadoTexto.textContent = "Armando el PDF…";
  try {
    await cargarPdf();
    if (exportacion !== exp) return;   // cancelaste mientras se cargaba
    const modelo = modeloPdf(exp.ids, modo, exp.filtro);
    if (!modelo.notas.length) throw new Error("vacío");
    const blob = window.diarioPdf.armar(modelo, modo);
    const archivo = new File([blob], nombreDePdf(modelo, modo), { type: "application/pdf" });
    exp.archivo = archivo;
    const tarde = performance.now() - t0 > 4000 || (modo === "completa" && modelo.notas.length > 8);
    if (tarde) throw Object.assign(new Error("tarde"), { name: "NotAllowedError" });
    await entregarPdf(archivo);
    cerrarExportar();
  } catch (err) {
    if (err?.name === "AbortError") { cerrarExportar(); return; }
    if (err?.name === "NotAllowedError" && exp.archivo) {
      // iOS pide un toque reciente para compartir: con un segundo toque sale.
      estadoTexto.textContent = "Tu PDF está listo.";
      const b = hojitaExportar.querySelector(".compartir-pdf");
      b.hidden = false;
      b.focus();
      return;
    }
    if (exportacion !== exp) return;
    estadoTexto.textContent = "No se pudo armar el PDF en este equipo.";
    hojitaExportar.querySelector(".cancelar").textContent = "Cerrar";
  } finally {
    boton?.classList.remove("trabajando");
    for (const b of hojitaExportar.querySelectorAll("[data-modo]")) b.disabled = b.dataset.modo === "marcas" && !exp.ids.some((id) => marcasEnOrden(estado.biblioteca.get(id), exp.filtro).length);
  }
}
for (const b of hojitaExportar.querySelectorAll("[data-modo]")) b.addEventListener("click", () => armarPdf(b.dataset.modo, performance.now()));
hojitaExportar.querySelector(".compartir-pdf").addEventListener("click", async () => {
  const archivo = exportacion?.archivo;
  if (!archivo) return;
  try { await entregarPdf(archivo); cerrarExportar(); }
  catch (err) { if (err?.name === "AbortError") cerrarExportar(); else hojitaExportar.querySelector(".estado-pdf").textContent = "No se pudo compartir el PDF desde acá."; }
});
hojitaExportar.querySelector(".cancelar").addEventListener("click", cerrarExportar);
hojitaExportar.addEventListener("click", (ev) => { if (ev.target === hojitaExportar) cerrarExportar(); });
function exportarPdf(ids, { filtro = null } = {}) { abrirExportar(ids, { filtro }); }

/* ---------- tus notas: guardadas, para más tarde y anotaciones ---------- */
let pestana = "guardadas";
let eligiendo = false;
let filtroColor = null;
const elegidas = new Set();
const filtroColores = panel.querySelector(".filtro-color");

function abrirPanel(cual = "guardadas") {
  cerrarIndice();
  pestana = cual;
  eligiendo = false;
  filtroColor = null;
  elegidas.clear();
  dibujarPanel();
  panel.hidden = false;
  requestAnimationFrame(() => panel.classList.add("abierto"));
  for (const n of [libro, recorrido, indiceBoton, chipFiltro, botonNueva, botonRecordatorio]) n.inert = true;
  if (cual === "anotaciones") precalentarPdf();
  panel.querySelector(`[data-pestana="${cual}"]`).focus({ preventScroll: true });
}
function cerrarPanel() {
  eligiendo = false;
  elegidas.clear();
  document.documentElement.style.removeProperty("--alto-pie");
  panel.classList.remove("abierto");
  for (const n of [libro, recorrido, indiceBoton, chipFiltro, botonNueva, botonRecordatorio]) n.inert = false;
  setTimeout(() => { panel.hidden = true; }, 360);
  indiceBoton.focus({ preventScroll: true });
}
panel.querySelector(".cerrar").addEventListener("click", cerrarPanel);
for (const b of panel.querySelectorAll("[data-pestana]")) {
  b.addEventListener("click", () => {
    pestana = b.dataset.pestana;
    eligiendo = false;
    filtroColor = null;
    elegidas.clear();
    dibujarPanel();
    if (pestana === "anotaciones") precalentarPdf();
  });
}
panel.querySelector(".elegir").addEventListener("click", () => {
  eligiendo = !eligiendo;
  elegidas.clear();
  dibujarPanel();
  if (eligiendo && pestana !== "tarde") precalentarPdf();
});
panel.querySelector(".todas").addEventListener("click", () => {
  const ids = idsDeLaPestana();
  const todas = ids.length && ids.every((id) => elegidas.has(id));
  elegidas.clear();
  if (!todas) ids.forEach((id) => elegidas.add(id));
  dibujarPanel();
});
panel.querySelector(".herramientas .pdf").addEventListener("click", () => exportarPdf(idsDeLaPestana(), { filtro: filtroColor }));
for (const b of filtroColores.querySelectorAll("button")) {
  b.addEventListener("click", () => {
    filtroColor = b.dataset.color && filtroColor !== b.dataset.color ? b.dataset.color : null;
    elegidas.clear();
    dibujarPanel();
  });
}

// Qué se puede hacer con lo elegido, según la pestaña (lo que borra va último, en coral).
const ACCIONES = {
  guardadas: [["pdf", "PDF"], ["compartir", "Compartir"], ["eliminar", "Eliminar"]],
  tarde: [["hora", "Cambiar hora"], ["compartir", "Compartir"], ["quitar", "Quitar"]],
  anotaciones: [["pdf", "PDF"], ["compartir", "Compartir"], ["desmarcar", "Borrar marcas"]],
};
function idsDeLaPestana() {
  return [...panel.querySelectorAll(".guardada[data-id]")].map((x) => x.dataset.id);
}
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
async function eliminarGuardadas(ids) {
  const regs = ids.map((id) => estado.biblioteca.get(id)).filter((r) => r?.guardada);
  if (!regs.length) return;
  const copias = instantanea(regs);
  const conMarcas = regs.some((r) => r.destacados.length);
  for (const r of regs) { r.guardada = null; await persistir(r); }
  avisar(regs.length === 1 ? "Eliminaste 1 guardada" : `Eliminaste ${regs.length} guardadas`, () => restaurar(copias),
    { detalle: conMarcas ? (regs.length === 1 ? "Sus marcas siguen en Anotaciones." : "Sus marcas siguen en Anotaciones.") : "" });
}
async function quitarDeMasTarde(ids) {
  const regs = ids.map((id) => estado.biblioteca.get(id)).filter((r) => r?.masTarde);
  if (!regs.length) return;
  const copias = instantanea(regs);
  for (const r of regs) { r.masTarde = null; r.avisado = false; await persistir(r); }
  avisar(`Quitaste ${regs.length} de Más tarde`, () => restaurar(copias));
}
async function borrarMarcasDe(ids, filtro = null) {
  const regs = ids.map((id) => estado.biblioteca.get(id)).filter((r) => r?.destacados.length);
  if (!regs.length) return;
  const copias = instantanea(regs);
  let marcas = 0, apuntes = 0;
  for (const r of regs) {
    const van = r.destacados.filter((d) => !filtro || d.color === filtro);
    marcas += van.length;
    apuntes += van.filter((d) => d.apunte).length;
    r.destacados = r.destacados.filter((d) => filtro && d.color !== filtro);
    await persistir(r);
  }
  const de = regs.length === 1 ? "de la nota" : `de ${regs.length} notas`;
  const texto = marcas === 1 ? "Borraste la marca" : `Borraste ${regs.length === 1 ? "las " : ""}${marcas} marcas`;
  avisar(`${texto}${apuntes ? ` y ${plural(apuntes, "apunte", "apuntes")}` : ""} ${de}`, () => restaurar(copias), { duracion: apuntes ? 10000 : 6000 });
}
async function accionElegida(accion) {
  if (!elegidas.size) return;
  const ids = [...elegidas];
  if (accion === "pdf") return exportarPdf(ids, { filtro: filtroColor });
  if (accion === "compartir") return abrirCompartir(ids, { filtro: filtroColor });
  if (accion === "hora") return abrirHojita(ids);
  eligiendo = false;
  elegidas.clear();
  if (accion === "eliminar") await eliminarGuardadas(ids);
  if (accion === "quitar") await quitarDeMasTarde(ids);
  if (accion === "desmarcar") await borrarMarcasDe(ids, filtroColor);
  dibujarPanel();
}

function encabezadoDeDia(iso) {
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return "Hoy";
  if (d.toDateString() === ayer.toDateString()) return "Ayer";
  const t = diaFmt.format(d).replace(",", "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function botonAccion(texto, accion, clase = "") {
  const b = el("button", clase || null, texto);
  b.type = "button";
  b.addEventListener("click", (ev) => { ev.stopPropagation(); accion(); });
  return b;
}

function dibujarPanel() {
  const enfocado = panel.contains(document.activeElement) ? document.activeElement.closest(".guardada")?.dataset.id : null;
  const habiaFoco = panel.contains(document.activeElement) || document.activeElement === document.body;
  dibujarPanelSinFoco();
  if (panel.hidden || !habiaFoco || panel.contains(document.activeElement)) return;
  const destino = (enfocado && panel.querySelector(`.guardada[data-id="${enfocado}"] .titulo`)) || panel.querySelector(".guardada .titulo") || panel.querySelector(`[data-pestana="${pestana}"]`);
  destino?.focus({ preventScroll: true });
}
function dibujarPanelSinFoco() {
  for (const b of panel.querySelectorAll("[data-pestana]")) b.setAttribute("aria-selected", String(b.dataset.pestana === pestana));
  const ahora = Date.now();
  const fechaNota = (r) => r.nota.publicada || r.nota.fecha || r.guardada;
  const actividad = (r) => r.destacados.reduce((a, d) => [d.creado, d.editado || ""].reduce((x, y) => (y > x ? y : x), a), "");
  let regs = [...estado.biblioteca.values()].filter((r) =>
    (pestana === "guardadas" ? r.guardada : pestana === "tarde" ? r.masTarde : r.destacados.length));
  // El filtro de color aparece en Anotaciones recién cuando usaste dos colores o más.
  const coloresUsados = new Set(pestana === "anotaciones" ? regs.flatMap((r) => r.destacados.map((d) => d.color)) : []);
  if (coloresUsados.size < 2 || (filtroColor && !coloresUsados.has(filtroColor))) filtroColor = null;
  filtroColores.hidden = pestana !== "anotaciones" || coloresUsados.size < 2;
  for (const b of filtroColores.querySelectorAll("button")) {
    b.setAttribute("aria-pressed", String(b.dataset.color ? b.dataset.color === filtroColor : !filtroColor));
    if (b.dataset.color) b.hidden = !coloresUsados.has(b.dataset.color);
  }
  if (filtroColor) regs = regs.filter((r) => r.destacados.some((d) => d.color === filtroColor));
  if (pestana === "guardadas") regs.sort((a, b) => fechaNota(b).localeCompare(fechaNota(a)));
  else if (pestana === "tarde") regs.sort((a, b) => a.masTarde.localeCompare(b.masTarde));
  else regs.sort((a, b) => actividad(b).localeCompare(actividad(a)));

  const herramientas = panel.querySelector(".herramientas");
  herramientas.hidden = !regs.length;
  const notas = plural(regs.length, "nota", "notas");
  let total = notas;
  if (pestana === "tarde") {
    const ya = regs.filter((r) => new Date(r.masTarde).getTime() <= ahora).length;
    if (ya) total += ` · ${ya} para ahora`;
  } else if (pestana === "anotaciones") {
    const marcas = regs.flatMap((r) => marcasEnOrden(r, filtroColor));
    const apuntes = marcas.filter((d) => d.apunte).length;
    const cuales = filtroColor ? `${marcas.length === 1 ? "marca" : "marcas"} ${marcas.length === 1 ? COLOR_SINGULAR[filtroColor] : COLOR_PLURAL[filtroColor]}` : (marcas.length === 1 ? "marca" : "marcas");
    total = `${marcas.length} ${cuales}${apuntes ? ` y ${plural(apuntes, "apunte", "apuntes")}` : ""} en ${notas}`;
  }
  herramientas.querySelector(".total").textContent = total;
  herramientas.querySelector(".elegir").textContent = eligiendo ? "Listo" : "Elegir";
  herramientas.querySelector(".pdf").hidden = pestana !== "anotaciones" || eligiendo;

  const lista = panel.querySelector(".lista");
  lista.classList.toggle("con-pie", eligiendo);
  lista.replaceChildren();
  if (!regs.length) {
    const [titulo, texto] = {
      guardadas: ["Todavía no guardaste notas.", "En el lector, tocá el señalador para guardar una nota."],
      tarde: ["No tenés notas para más tarde.", "En el lector, tocá el reloj y elegí cuándo querés que te la recuerde."],
      anotaciones: ["Todavía no marcaste nada.", "En una nota, tocá una frase y elegí un color. Para marcar un pedazo exacto, mantené apretado el texto. Con «Escribir» dejás un apunte al lado."],
    }[pestana];
    const vacio = el("div", "vacio");
    vacio.append(el("h3", null, titulo), el("p", null, texto));
    lista.append(vacio);
  }
  let grupo = "";
  const grupos = pestana === "tarde" ? new Set(regs.map((r) => (new Date(r.masTarde).getTime() <= ahora ? "ahora" : "despues"))) : null;
  for (const r of regs) {
    // Encabezados: por día (Guardadas y Anotaciones) o «Para ahora» / «Más adelante» (Más tarde).
    const clave = pestana === "tarde" ? (new Date(r.masTarde).getTime() <= ahora ? "Para ahora" : "Más adelante")
      : encabezadoDeDia(pestana === "guardadas" ? fechaNota(r) : actividad(r));
    if (clave !== grupo && (pestana !== "tarde" || grupos.size > 1)) lista.append(el("h3", "dia", clave));
    grupo = clave;

    const item = el("article", `guardada${eligiendo ? " eligiendo" : ""}${elegidas.has(r.id) ? " elegida" : ""}`);
    item.dataset.id = r.id;
    item.style.cssText = colores(r.medio);
    const alternar = () => {
      if (elegidas.has(r.id)) elegidas.delete(r.id); else elegidas.add(r.id);
      item.classList.toggle("elegida", elegidas.has(r.id));
      const tilde = item.querySelector("input");
      if (tilde) tilde.checked = elegidas.has(r.id);
      pintarSeleccion();
    };
    if (eligiendo) {
      const tilde = el("input");
      tilde.type = "checkbox";
      tilde.checked = elegidas.has(r.id);
      tilde.setAttribute("aria-label", r.nota.titulo);
      tilde.addEventListener("click", (ev) => { ev.stopPropagation(); alternar(); tilde.checked = elegidas.has(r.id); });
      item.append(tilde);
      item.addEventListener("click", alternar);
    }
    // El título va primero y el pie debajo: nada arriba de los títulos.
    const titulo = el("button", "titulo", r.nota.titulo);
    titulo.type = "button";
    titulo.addEventListener("click", (ev) => { if (eligiendo) return; ev.stopPropagation(); abrirNota(r.id); });
    const pie = el("p", "pie");
    const detalles = [];
    if (pestana === "tarde") {
      const d = new Date(r.masTarde);
      if (d.getTime() <= ahora) detalles.push(`desde las ${horaFmt.format(d)}`);
      else {
        const dias = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 864e5);
        const h = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
        detalles.push(dias === 0 ? `hoy, ${h}` : dias === 1 ? `mañana, ${h}` : `${diaFmt.format(d).split(",")[0]}, ${h}`);
      }
    } else detalles.push(hora(r.nota.publicada || r.nota.fecha));
    if (r.nota.a_medias) detalles.push("a medias");
    if (pestana === "guardadas" && r.destacados.length) detalles.push(plural(r.destacados.length, "marca", "marcas"));
    pie.append(insignia(r.medio), document.createTextNode(r.medio.nombre), el("span", `gris${pestana === "tarde" && new Date(r.masTarde).getTime() <= ahora ? " ya" : ""}`, `· ${detalles.filter(Boolean).join(" · ")}`));
    item.append(titulo, pie);

    if (pestana === "anotaciones") {
      const perdidas = marcasPerdidasDe(r);
      const ul = el("ul", "destacados");
      for (const d of marcasEnOrden(r, filtroColor)) {
        const li = el("li");
        li.dataset.color = d.color;
        const perdida = perdidas.has(d.id);
        li.classList.toggle("perdida", perdida);
        const ir = el("button", "marca");
        ir.type = "button";
        ir.append(el("mark", null, d.texto));
        ir.setAttribute("aria-label", `Abrir la nota en esta marca: ${d.texto}`);
        ir.addEventListener("click", (ev) => { if (eligiendo) return; ev.stopPropagation(); abrirNota(r.id, { marca: d.id }); });
        const cuerpoMarca = el("div", "cuerpo-marca");
        cuerpoMarca.append(ir);
        if (d.apunte) {
          const ap = el("p", "apunte-panel", d.apunte);
          ap.addEventListener("click", (ev) => { if (eligiendo) return; ev.stopPropagation(); abrirNota(r.id, { marca: d.id }); });
          cuerpoMarca.append(ap);
        }
        if (perdida) cuerpoMarca.append(el("p", "perdida", "Ya no está en el texto de la nota."));
        li.append(cuerpoMarca);
        if (!eligiendo) {
          const borrar = el("button", "borrar");
          borrar.type = "button";
          borrar.setAttribute("aria-label", "Borrar esta marca");
          borrar.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
          borrar.addEventListener("click", async (ev) => {
            ev.stopPropagation();
            const copias = instantanea([r]);
            r.destacados = r.destacados.filter((x) => x.id !== d.id);
            await persistir(r);
            dibujarPanel();
            avisar(d.apunte ? "Borraste la marca y su apunte" : "Borraste la marca", () => restaurar(copias), { duracion: d.apunte ? 10000 : 6000 });
          });
          li.append(borrar);
        }
        ul.append(li);
      }
      item.append(ul);
    }
    if (!eligiendo) {
      const acciones = el("div", "acciones");
      if (pestana === "guardadas") {
        acciones.append(
          botonAccion("PDF", () => exportarPdf([r.id])),
          botonAccion("Compartir", () => abrirCompartir([r.id])),
          botonAccion("Eliminar", async () => { await eliminarGuardadas([r.id]); dibujarPanel(); }));
      } else if (pestana === "tarde") {
        acciones.append(
          botonAccion("Cambiar hora", () => abrirHojita(r.id)),
          botonAccion("Compartir", () => abrirCompartir([r.id])),
          botonAccion("Quitar", async () => { await quitarDeMasTarde([r.id]); dibujarPanel(); }));
      } else {
        const cuantas = marcasEnOrden(r, filtroColor).length;
        acciones.append(
          botonAccion("PDF", () => exportarPdf([r.id], { filtro: filtroColor })),
          botonAccion("Compartir", () => abrirCompartir([r.id], { filtro: filtroColor })),
          botonAccion(cuantas === 1 ? "Borrar la marca" : "Borrar marcas", async () => { await borrarMarcasDe([r.id], filtroColor); dibujarPanel(); }));
      }
      item.append(acciones);
    }
    lista.append(item);
  }
  pintarSeleccion();
}
function pintarSeleccion() {
  const pie = panel.querySelector(".seleccion");
  pie.hidden = !eligiendo;
  document.documentElement.style.setProperty("--alto-pie", eligiendo ? `${pie.getBoundingClientRect().height || 120}px` : "0px");
  pie.querySelector(".cuantas").textContent = elegidas.size ? `${elegidas.size} ${elegidas.size === 1 ? "elegida" : "elegidas"}` : "Elegí notas";
  const caja = pie.querySelector(".acciones");
  if (caja.dataset.pestana !== pestana) {
    caja.replaceChildren(...ACCIONES[pestana].map(([accion, texto]) => {
      const b = el("button", accion === "eliminar" || accion === "desmarcar" || accion === "quitar" ? "peligro" : null, texto);
      b.type = "button";
      b.dataset.accion = accion;
      b.addEventListener("click", () => accionElegida(accion));
      return b;
    }));
    caja.dataset.pestana = pestana;
  }
  for (const b of caja.querySelectorAll("button")) b.disabled = !elegidas.size;
  const todas = panel.querySelector(".todas");
  todas.hidden = !eligiendo;
  const ids = idsDeLaPestana();
  todas.textContent = ids.length && ids.every((id) => elegidas.has(id)) ? "Ninguna" : "Elegir todas";
}

/* ---------- índice: la red completa, siempre a mano ---------- */
function abrirIndice() {
  const e = estado.edicion;
  indice.querySelector(".titulo").textContent = `Edición de las ${horaFmt.format(new Date(e.generada))}`;
  const red = indice.querySelector(".red");
  red.replaceChildren();
  const seccionActual = estado.hojas[estado.actual]?.seccion;
  const item = (texto, cuenta, alTocar, actual) => {
    const li = el("li");
    const b = el("button");
    b.type = "button";
    b.append(el("span", "nombre", texto));
    if (cuenta != null) b.append(el("span", "cuenta", String(cuenta)));
    if (actual) { li.classList.add("aca"); b.setAttribute("aria-current", "true"); }
    b.addEventListener("click", () => { cerrarIndice(); alTocar(); });
    li.append(b);
    red.append(li);
  };
  item("Tapa", null, () => mostrar(0), estado.actual === 0);
  for (const s of estado.secciones) {
    item(s.nombre, s.notas.length, () => mostrar(estado.hojas.findIndex((h) => h.seccion === s.id && h.el.classList.contains("apertura"))),
      estado.actual !== 0 && seccionActual === s.id);
  }
  const otros = indice.querySelector(".otros");
  otros.replaceChildren();
  const boton = (texto, cuenta, alTocar) => {
    const b = el("button");
    b.type = "button";
    b.append(el("span", null, texto));
    if (cuenta != null) b.append(el("span", "cuenta", String(cuenta)));
    b.addEventListener("click", alTocar);
    otros.append(b);
  };
  const regs = [...estado.biblioteca.values()];
  boton("Guardadas", regs.filter((r) => r.guardada).length, () => abrirPanel("guardadas"));
  boton("Para más tarde", regs.filter((r) => r.masTarde).length, () => abrirPanel("tarde"));
  boton("Anotaciones", regs.filter((r) => r.destacados.length).length, () => abrirPanel("anotaciones"));
  boton("Avisos de último momento", null, abrirAvisos);
  boton(estado.filtro ? `Medios: sólo ${estado.medios.get(estado.filtro).nombre}` : "Medios", null, () => { cerrarIndice(); abrirMedios(null); });
  indice.hidden = false;
  indiceBoton.setAttribute("aria-expanded", "true");
  requestAnimationFrame(() => indice.classList.add("abierto"));
  indice.querySelector(".red button").focus();
}
function cerrarIndice() {
  if (indice.hidden) return;
  indice.classList.remove("abierto");
  indiceBoton.setAttribute("aria-expanded", "false");
  setTimeout(() => { indice.hidden = true; }, 300);
}
indiceBoton.addEventListener("click", () => (indice.hidden ? abrirIndice() : cerrarIndice()));
indice.querySelector(".cerrar").addEventListener("click", cerrarIndice);

/* ---------- tamaño: teléfono o tableta, y la orientación ---------- */
function medir() {
  // Tableta (o compu) cuando entran dos columnas de notas con aire; el teléfono acostado sigue siendo teléfono.
  const tableta = innerWidth >= 700 && innerHeight >= 600;
  return { modo: tableta ? "tableta" : "telefono", orientacion: innerWidth >= innerHeight ? "horizontal" : "vertical" };
}

function rearmar(conservar) {
  if (!estado.edicion) return;  // todavía en la pantalla de la clave
  const { modo, orientacion } = medir();
  if (modo === estado.modo && orientacion === estado.orientacion) return;
  const notaActual = conservar && estado.hojas[estado.actual] && estado.hojas[estado.actual].notas[0];
  const seccionActual = conservar && estado.hojas[estado.actual] && estado.hojas[estado.actual].seccion;
  estado.modo = modo;
  estado.orientacion = orientacion;
  document.documentElement.classList.toggle("tableta", modo === "tableta");
  document.documentElement.classList.toggle("horizontal", orientacion === "horizontal");
  armarHojas();
  pintarAperturas();
  let i = 0;
  if (notaActual) i = Math.max(0, estado.hojas.findIndex((h) => h.notas.includes(notaActual)));
  else if (seccionActual) i = Math.max(0, estado.hojas.findIndex((h) => h.seccion === seccionActual));
  mostrar(i);
}
let esperaTamano = 0;
addEventListener("resize", () => { clearTimeout(esperaTamano); esperaTamano = setTimeout(() => rearmar(true), 180); });

/* ---------- la edición cifrada ---------- */
// En la nube la edición viaja cifrada (AES-GCM, clave derivada con PBKDF2 de la frase de Lucca).
// La clave derivada se guarda en este equipo como CryptoKey no exportable: la frase no se guarda.
const base64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function claveGuardada() {
  try {
    const db = await abrirBase();
    return await new Promise((ok) => {
      const r = db.transaction("claves").objectStore("claves").get("edicion");
      r.onsuccess = () => ok(r.result || null);
      r.onerror = () => ok(null);
    });
  } catch { return null; }
}
async function guardarClave(clave) {
  try {
    const db = await abrirBase();
    db.transaction("claves", "readwrite").objectStore("claves").put(clave, "edicion");
  } catch { /* sin almacenamiento: la pedirá de nuevo la próxima vez */ }
}
async function derivar(frase, sobre) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(frase.normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: base64(sobre.sal), iterations: sobre.iteraciones },
    base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
}
async function abrirSobre(sobre, clave) {
  const plano = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64(sobre.iv) }, clave, base64(sobre.datos));
  const flujo = new Blob([plano]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(flujo).text());
}

function pedirClave(sobre) {
  const pantalla = document.getElementById("clave");
  const form = pantalla.querySelector("form");
  const campo = pantalla.querySelector("input");
  const boton = pantalla.querySelector("button");
  const error = pantalla.querySelector(".error");
  pantalla.hidden = false;
  recorrido.hidden = true;
  campo.focus();
  return new Promise((ok) => {
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      boton.disabled = true;
      boton.textContent = "Abriendo…";
      error.textContent = "";
      try {
        const clave = await derivar(campo.value, sobre);
        const edicion = await abrirSobre(sobre, clave);
        await guardarClave(clave);
        pantalla.hidden = true;
        recorrido.hidden = false;
        campo.value = "";
        ok({ clave, edicion });
      } catch {
        error.textContent = "Esa clave no abre la edición. Revisala y probá de nuevo.";
        campo.select();
      } finally {
        boton.disabled = false;
        boton.textContent = "Abrir la edición";
      }
    });
  });
}

async function traerSobre() {
  const r = await fetch("edicion.cifrada.json", { cache: "no-cache" });
  return r.ok ? r.json() : null;
}

// Lo que arma la edición: cifrada en la nube; sin cifrar sólo en la Mac, para trabajar.
async function cargarEdicion() {
  const sobre = await traerSobre().catch(() => null);
  if (sobre) {
    let clave = await claveGuardada();
    let edicion = clave && await abrirSobre(sobre, clave).catch(() => null);
    if (!edicion) ({ clave, edicion } = await pedirClave(sobre));
    estado.clave = clave;
    return edicion;
  }
  const r = await fetch("datos/edicion.json", { cache: "no-cache" });
  if (!r.ok) throw new Error("No pude leer la edición");
  return r.json();
}

function montar(edicion) {
  estado.edicion = edicion;
  estado.medios = new Map(edicion.medios.map((m) => [m.id, m]));
  estado.notas = new Map(edicion.notas.map((n) => [n.id, n]));
  estado.temaDe = new Map((edicion.temas || []).flatMap((g) => g.map((id) => [id, g])));
  if (estado.filtro && !estado.medios.has(estado.filtro)) estado.filtro = null;
  const cs = edicion.medios.map((m) => m.linea.color);
  const paso = 100 / cs.length;
  document.documentElement.style.setProperty("--combinacion",
    `linear-gradient(90deg, ${cs.map((c, i) => `${c} ${(i * paso).toFixed(2)}% ${((i + 1) * paso).toFixed(2)}%`).join(", ")})`);
}

/* ---------- edición nueva: se avisa, nunca te saca de la hoja ---------- */
const botonNueva = document.getElementById("nueva");
let nuevaPendiente = null;

async function revisarEdicion() {
  if (!estado.clave || document.hidden) return;
  try {
    const v = await (await fetch("version.json", { cache: "no-store" })).json();
    if (v.generada && v.generada !== estado.edicion.generada && v.generada !== nuevaPendiente) {
      nuevaPendiente = v.generada;
      botonNueva.replaceChildren(document.createTextNode(`Edición de las ${horaFmt.format(new Date(v.generada))}`), el("span", null, "· Actualizar"));
      botonNueva.hidden = false;
      requestAnimationFrame(() => botonNueva.classList.add("visible"));
    }
  } catch { /* sin conexión: se vuelve a intentar más tarde */ }
}

botonNueva.addEventListener("click", async () => {
  botonNueva.classList.remove("visible");
  const esperada = nuevaPendiente;
  try {
    const edicion = await abrirSobre(await traerSobre(), estado.clave);
    if (edicion.generada === estado.edicion.generada) throw new Error("llegó la misma");
    montar(edicion);
    estado.modo = "";          // fuerza a rearmar las hojas con la edición nueva
    rearmar(true);
    aviso.textContent = `Edición de las ${horaFmt.format(new Date(edicion.generada))} lista.`;
    if (edicion.generada !== esperada) nuevaPendiente = null;
  } catch {
    // Sin señal (o llegó la de antes): queda la que había y el aviso vuelve a aparecer en la próxima revisión.
    nuevaPendiente = null;
    avisar("No se pudo traer la edición nueva. Probá en un rato");
  }
  setTimeout(() => { botonNueva.hidden = true; }, 450);
});

/* ---------- arranque ---------- */
async function iniciar() {
  await cargarBiblioteca();
  montar(await cargarEdicion());
  estado.leidas = new Set(leerMemoria("leidas", []));
  // Volver a la estación donde te bajaste, si es la misma edición (y el mismo filtro).
  const pos = leerMemoria("posicion", null);
  if (pos && pos.edicion === estado.edicion.generada && pos.filtro && estado.medios.has(pos.filtro)) estado.filtro = pos.filtro;
  rearmar(false);
  pintarFiltro();
  if (pos && pos.edicion === estado.edicion.generada && pos.modo === estado.modo) mostrar(pos.hoja);
  // Enlaces directos: #hoja=N abre esa hoja; #seccion=id, su apertura; #nota=ID, esa nota en el lector.
  const ancla = new URLSearchParams(location.hash.slice(1));
  if (ancla.has("hoja")) mostrar(Number(ancla.get("hoja")));
  if (ancla.has("seccion")) mostrar(Math.max(0, estado.hojas.findIndex((h) => h.seccion === ancla.get("seccion"))));
  if (ancla.has("nota") && notaPorId(ancla.get("nota"))) abrirNota(ancla.get("nota"), { sinAnimacion: true });
  indiceBoton.hidden = false;
  aviso.textContent = `Edición de las ${horaFmt.format(new Date(estado.edicion.generada))} lista.`;

  // Con la app abierta, cada 5 minutos y al volver a ella se fija si hay edición nueva
  // y si llegó la hora de alguna nota que dejaste para más tarde.
  revisarRecordatorios();
  setInterval(() => { revisarEdicion(); revisarRecordatorios(); }, 60 * 1000);
  document.addEventListener("visibilitychange", () => { revisarEdicion(); revisarRecordatorios(); });
}

// El service worker se registra de entrada (también con la pantalla de la clave abierta),
// para que la app quede guardada en el equipo desde la primera visita. En la Mac no.
if ("serviceWorker" in navigator && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

iniciar().catch((err) => {
  libro.replaceChildren();
  const h = el("section", "hoja terminal");
  h.append(el("h2", null, "Sin edición."), el("p", null, `${err.message}. Probá de nuevo en un rato.`));
  libro.append(h);
  recorrido.hidden = true;
});
