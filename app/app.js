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
const botonDestacar = document.getElementById("destacar");
const tiraMarcar = document.getElementById("tira-marcar");
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
function avisar(texto) {
  toast.textContent = texto;
  toast.classList.add("visible");
  clearTimeout(esperaToast);
  esperaToast = setTimeout(() => toast.classList.remove("visible"), 2800);
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
function abrirBase() {
  return new Promise((ok, mal) => {
    const r = indexedDB.open("diario-del-pelado", 2);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("claves")) db.createObjectStore("claves");
      if (!db.objectStoreNames.contains("biblioteca")) db.createObjectStore("biblioteca", { keyPath: "id" });
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
}
async function cargarBiblioteca() {
  try {
    const db = await abrirBase();
    const todos = await new Promise((ok) => {
      const r = db.transaction("biblioteca").objectStore("biblioteca").getAll();
      r.onsuccess = () => ok(r.result || []);
      r.onerror = () => ok([]);
    });
    estado.biblioteca = new Map(todos.map((x) => [x.id, x]));
  } catch { estado.biblioteca = new Map(); }
}
async function persistir(registro) {
  const vacio = !registro.guardada && !registro.masTarde && !registro.destacados.length;
  if (vacio) estado.biblioteca.delete(registro.id); else estado.biblioteca.set(registro.id, registro);
  try {
    const db = await abrirBase();
    const almacen = db.transaction("biblioteca", "readwrite").objectStore("biblioteca");
    if (vacio) almacen.delete(registro.id); else almacen.put(registro);
  } catch { avisar("No se pudo guardar en este equipo"); }
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
  if (!hojitaTarde.hidden) return "tarde";
  if (!desplegable.hidden) return "medios";
  if (lector.classList.contains("abierto")) return "lector";
  if (!panel.hidden) return "panel";
  if (!indice.hidden) return "indice";
  return null;
}
document.addEventListener("keydown", (ev) => {
  if (!estado.edicion || ev.target.closest?.("input, textarea, [contenteditable]")) return;
  const capa = capaAbierta();
  if (capa) {
    if (ev.key === "Escape") ({ tarde: cerrarHojita, medios: cerrarMedios, lector: cerrarNota, panel: cerrarPanel, indice: cerrarIndice })[capa]();
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
    medias.append(el("b", null, "Nota a medias. "), document.createTextNode(`${m.nombre} sólo deja leer el comienzo desde acá. La nota completa está en su sitio.`));
    art.append(medias);
  }
  const cuerpo = el("div", "cuerpo");
  cuerpo.append(...limpiarCuerpo(n.cuerpo_html, n.foto, n.url).childNodes);
  art.append(cuerpo);
  for (const d of estado.biblioteca.get(id)?.destacados || []) marcarTexto(cuerpo, d.texto);

  const cierre = lector.querySelector(".cierre");
  cierre.replaceChildren();
  const original = el("a", "original");
  original.href = n.url;
  original.target = "_blank";
  original.rel = "noopener";
  original.append(document.createTextNode(n.a_medias ? `Seguir leyendo en ${m.nombre}` : `Ver la nota en ${m.nombre}`));
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
  lector.querySelector("button.cerrar").focus({ preventScroll: true });
  // Desde Anotaciones: la nota se abre en la marca que tocaste.
  const enMarca = marca && [...cuerpo.querySelectorAll("mark")].find((x) => x.dataset.texto === marca);
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
    enMarca.classList.add("resalta");
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
  estado.notaAbierta = null;
  botonDestacar.hidden = true;
  ponerMarcador(false);
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

/* ---------- marcar: el lápiz marca frases enteras; también se puede elegir un pedazo ---------- */
// Envuelve en <mark> la primera aparición de `texto` dentro de `raiz`, aunque cruce negritas o enlaces.
function marcarTexto(raiz, texto) {
  const buscado = texto.replace(/\s+/g, " ").trim();
  if (!buscado) return false;
  const nodos = [];
  let total = "";
  const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { nodos.push({ n: w.currentNode, desde: total.length }); total += w.currentNode.data; }
  let normal = "";
  const mapa = [];
  let enBlanco = false;
  for (let i = 0; i < total.length; i++) {
    if (/\s/.test(total[i])) {
      if (!enBlanco) { normal += " "; mapa.push(i); }
      enBlanco = true;
    } else { normal += total[i]; mapa.push(i); enBlanco = false; }
  }
  const k = normal.indexOf(buscado);
  if (k < 0) return false;
  const inicio = mapa[k], fin = mapa[k + buscado.length - 1] + 1;
  for (const { n, desde } of nodos) {
    const hasta = desde + n.data.length;
    if (hasta <= inicio || desde >= fin) continue;
    const a = Math.max(inicio, desde) - desde, b = Math.min(fin, hasta) - desde;
    let tramo = n;
    if (a > 0) tramo = n.splitText(a);
    if (b - a < tramo.data.length) tramo.splitText(b - a);
    const mark = el("mark");
    mark.dataset.texto = buscado;
    tramo.replaceWith(mark);
    mark.append(tramo);
  }
  return true;
}
function desmarcar(raiz, texto) {
  for (const m of [...raiz.querySelectorAll("mark")].filter((x) => x.dataset.texto === texto)) m.replaceWith(...m.childNodes);
  raiz.normalize();
}

// La frase que hay bajo el dedo: del punto anterior al siguiente, dentro del mismo párrafo.
const ABREVIATURAS = /(?:\b(?:Sr|Sra|Dr|Dra|Lic|Ing|Gral|Cnel|Av|etc)|[A-ZÁÉÍÓÚÑ])$/;
function fraseEn(x, y, cuerpo) {
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
  if (nodo.nodeType !== Node.TEXT_NODE || !cuerpo.contains(nodo)) return null;
  const bloque = nodo.parentElement.closest("p, li, blockquote, h2, h3, h4, figcaption, td");
  if (!bloque || !cuerpo.contains(bloque)) return null;
  let texto = "", pos = -1;
  const w = document.createTreeWalker(bloque, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) {
    if (w.currentNode === nodo) pos = texto.length + offset;
    texto += w.currentNode.data;
  }
  if (pos < 0) return null;
  const cortes = /[.!?…]["”»’)]*(?=\s|$)/g;
  let desde = 0, hasta = texto.length, m;
  while ((m = cortes.exec(texto))) {
    if (m[0][0] === "." && ABREVIATURAS.test(texto.slice(0, m.index))) continue;  // EE.UU., Sr.
    const corte = m.index + m[0].length;
    if (corte <= pos) desde = corte;
    else { hasta = corte; break; }
  }
  const frase = texto.slice(desde, hasta).replace(/\s+/g, " ").trim();
  return frase.length >= 3 ? { frase, bloque } : null;
}

async function agregarMarca(raiz, texto) {
  const reg = registroDe(estado.notaAbierta);
  if (reg.destacados.some((d) => d.texto === texto) || !marcarTexto(raiz, texto)) return;
  reg.destacados.push({ texto, creado: new Date().toISOString() });
  await persistir(reg);
  avisar(reg.destacados.length === 1 ? "Marcado. Está en Anotaciones" : "Marcado");
}
async function borrarMarca(texto) {
  const reg = registroDe(estado.notaAbierta);
  reg.destacados = reg.destacados.filter((d) => d.texto !== texto);
  desmarcar(lector.querySelector(".cuerpo"), texto);
  await persistir(reg);
  avisar("Desmarcado");
}

let marcando = false;
function ponerMarcador(si) {
  marcando = si;
  const b = lector.querySelector(".marcar");
  b.setAttribute("aria-pressed", String(si));
  b.setAttribute("aria-label", si ? "Dejar de marcar" : "Marcar frases");
  b.classList.toggle("activo", si);
  lector.classList.toggle("marcando", si);
  tiraMarcar.hidden = !si;
}
lector.querySelector(".marcar").addEventListener("click", () => ponerMarcador(!marcando));
tiraMarcar.querySelector("button").addEventListener("click", () => ponerMarcador(false));
// Con el lápiz, tocar una frase la marca y tocar una marca la desmarca (los enlaces no se abren).
lector.addEventListener("click", (ev) => {
  const cuerpo = lector.querySelector(".cuerpo");
  if (!marcando || !cuerpo?.contains(ev.target) || !getSelection().isCollapsed) return;
  ev.preventDefault();
  ev.stopPropagation();
  const mark = ev.target.closest("mark");
  if (mark) { borrarMarca(mark.dataset.texto); return; }
  const f = fraseEn(ev.clientX, ev.clientY, cuerpo);
  if (f) agregarMarca(f.bloque, f.frase);
}, true);

// Sin el lápiz: elegís un pedazo y aparece «Marcar»; tocás una marca y aparece «Desmarcar».
let destacarModo = null;  // { tipo: "nuevo", texto } | { tipo: "quitar", texto }
function pintarDestacar(modo) {
  destacarModo = modo;
  botonDestacar.hidden = !modo;
  if (modo) botonDestacar.querySelector("span").textContent = modo.tipo === "nuevo" ? "Marcar" : "Desmarcar";
}
document.addEventListener("selectionchange", () => {
  if (!lector.classList.contains("abierto")) return;
  const sel = getSelection();
  const cuerpo = lector.querySelector(".cuerpo");
  const texto = sel && !sel.isCollapsed ? sel.toString().replace(/\s+/g, " ").trim() : "";
  const adentro = cuerpo && sel.rangeCount && cuerpo.contains(sel.getRangeAt(0).commonAncestorContainer);
  if (texto.length >= 3 && adentro) pintarDestacar({ tipo: "nuevo", texto });
  else if (destacarModo?.tipo === "nuevo") pintarDestacar(null);
});
lector.addEventListener("click", (ev) => {
  const mark = ev.target.closest("mark");
  if (mark && getSelection().isCollapsed) pintarDestacar({ tipo: "quitar", texto: mark.dataset.texto });
  else if (destacarModo?.tipo === "quitar" && !ev.target.closest("#destacar")) pintarDestacar(null);
});
botonDestacar.addEventListener("pointerdown", (ev) => ev.preventDefault());  // que no se pierda la selección
botonDestacar.addEventListener("click", async () => {
  const modo = destacarModo;
  if (!modo) return;
  pintarDestacar(null);
  if (modo.tipo === "nuevo") {
    await agregarMarca(lector.querySelector(".cuerpo"), modo.texto);
    getSelection().removeAllRanges();
  } else await borrarMarca(modo.texto);
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
function abrirHojita(id) {
  notaParaTarde = id;
  const caja = hojitaTarde.querySelector(".opciones");
  caja.replaceChildren();
  const reg = estado.biblioteca.get(id);
  for (const [texto, cuando] of opcionesDeTarde()) {
    const b = el("button", null, texto);
    b.type = "button";
    b.addEventListener("click", async () => {
      const r = registroDe(id);
      r.masTarde = cuando.toISOString();
      r.avisado = false;
      await persistir(r);
      cerrarHojita();
      pintarBotonesLector();
      avisar(`Te la recuerdo después de las ${horaFmt.format(cuando)}`);
    });
    caja.append(b);
  }
  if (reg?.masTarde) {
    const q = el("button", "quitar", "Ya no, sacarla de la lista");
    q.type = "button";
    q.addEventListener("click", async () => { reg.masTarde = null; await persistir(reg); cerrarHojita(); pintarBotonesLector(); avisar("Sacada de para más tarde"); });
    caja.append(q);
  }
  hojitaTarde.hidden = false;
  requestAnimationFrame(() => hojitaTarde.classList.add("abierta"));
  caja.querySelector("button").focus();
}
function cerrarHojita() {
  hojitaTarde.classList.remove("abierta");
  setTimeout(() => { hojitaTarde.hidden = true; }, 260);
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

/* ---------- compartir: una o varias notas, por mail o para Claude ---------- */
function bloqueDeNota(reg, completo) {
  const n = reg.nota;
  const fecha = diaFmt.format(new Date(n.publicada || n.fecha || reg.guardada || Date.now()));
  const destacados = reg.destacados.map((d) => `«${d.texto}»`);
  if (!completo) {
    return [n.titulo, `${reg.medio.nombre} · ${fecha}`, ...destacados, n.url].join("\n");
  }
  return [`# ${n.titulo}`, `${reg.medio.nombre} · ${fecha} · ${n.url}`, n.bajada || "", textoPlano(n.cuerpo_html),
    destacados.length ? `Lo que marqué:\n${destacados.map((d) => `- ${d}`).join("\n")}` : ""].filter(Boolean).join("\n\n");
}
async function compartir(ids, como) {
  const regs = ids.map((id) => estado.biblioteca.get(id) || registroDe(id));
  const completo = como === "claude";
  const texto = regs.map((r) => bloqueDeNota(r, completo)).join(completo ? "\n\n---\n\n" : "\n\n———\n\n");
  const asunto = regs.length === 1 ? regs[0].nota.titulo : `${regs.length} notas de el diario del pelado`;
  if (como === "mail") {
    location.href = `mailto:?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto)}`;
    return;
  }
  const datos = regs.length === 1 && !completo
    ? { title: asunto, text: bloqueDeNota(regs[0], false).replace(`\n${regs[0].nota.url}`, ""), url: regs[0].nota.url }
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

/* ---------- tus notas: guardadas, para más tarde y anotaciones ---------- */
let pestana = "guardadas";
let eligiendo = false;
const elegidas = new Set();

function abrirPanel(cual = "guardadas") {
  cerrarIndice();
  pestana = cual;
  eligiendo = false;
  elegidas.clear();
  dibujarPanel();
  panel.hidden = false;
  requestAnimationFrame(() => panel.classList.add("abierto"));
  for (const n of [libro, recorrido, indiceBoton, chipFiltro]) n.inert = true;
}
function cerrarPanel() {
  panel.classList.remove("abierto");
  for (const n of [libro, recorrido, indiceBoton, chipFiltro]) n.inert = false;
  setTimeout(() => { panel.hidden = true; }, 360);
}
panel.querySelector(".cerrar").addEventListener("click", cerrarPanel);
for (const b of panel.querySelectorAll("[data-pestana]")) {
  b.addEventListener("click", () => { pestana = b.dataset.pestana; eligiendo = false; elegidas.clear(); dibujarPanel(); });
}
panel.querySelector(".elegir").addEventListener("click", () => { eligiendo = !eligiendo; elegidas.clear(); dibujarPanel(); });
for (const b of panel.querySelectorAll(".seleccion [data-accion]")) {
  b.addEventListener("click", () => { if (elegidas.size) compartir([...elegidas], b.dataset.accion); });
}

function dibujarPanel() {
  for (const b of panel.querySelectorAll("[data-pestana]")) b.setAttribute("aria-selected", String(b.dataset.pestana === pestana));
  const fechaNota = (r) => r.nota.publicada || r.nota.fecha || r.guardada;
  const ultimaMarca = (r) => r.destacados.reduce((a, d) => (d.creado > a ? d.creado : a), "");
  const regs = [...estado.biblioteca.values()].filter((r) =>
    (pestana === "guardadas" ? r.guardada : pestana === "tarde" ? r.masTarde : r.destacados.length));
  // Guardadas: por fecha de la nota, de la más nueva a la más vieja. Más tarde: por hora del recordatorio.
  // Anotaciones: la nota que marcaste último, arriba.
  if (pestana === "guardadas") regs.sort((a, b) => fechaNota(b).localeCompare(fechaNota(a)));
  else if (pestana === "tarde") regs.sort((a, b) => a.masTarde.localeCompare(b.masTarde));
  else regs.sort((a, b) => ultimaMarca(b).localeCompare(ultimaMarca(a)));

  const herramientas = panel.querySelector(".herramientas");
  herramientas.hidden = !regs.length;
  const marcas = regs.reduce((t, r) => t + r.destacados.length, 0);
  const notas = `${regs.length} ${regs.length === 1 ? "nota" : "notas"}`;
  herramientas.querySelector(".total").textContent = pestana === "anotaciones" ? `${marcas} ${marcas === 1 ? "marca" : "marcas"} en ${notas}` : notas;
  herramientas.querySelector(".elegir").textContent = eligiendo ? "Listo" : "Elegir";

  const lista = panel.querySelector(".lista");
  lista.replaceChildren();
  if (!regs.length) {
    const [titulo, texto] = {
      guardadas: ["Todavía no guardaste notas.", "En el lector, tocá el señalador para guardar una nota."],
      tarde: ["No tenés notas para más tarde.", "En el lector, tocá el reloj y elegí cuándo querés que te la recuerde."],
      anotaciones: ["Todavía no marcaste nada.", "En el lector, tocá el lápiz y después la frase que querés marcar. También podés mantener apretado el texto, elegir un pedazo y tocar «Marcar»."],
    }[pestana];
    const vacio = el("div", "vacio");
    vacio.append(el("h3", null, titulo), el("p", null, texto));
    lista.append(vacio);
  }
  let diaActual = "";
  for (const r of regs) {
    const cuando = pestana === "guardadas" ? fechaNota(r) : pestana === "tarde" ? r.masTarde : ultimaMarca(r);
    const dia = diaFmt.format(new Date(cuando));
    if (pestana !== "tarde" && dia !== diaActual) { lista.append(el("h3", "dia", dia)); diaActual = dia; }
    const item = el("article", "guardada");
    item.style.cssText = colores(r.medio);
    const elegirEsta = () => item.querySelector("input").click();
    if (eligiendo) {
      const tilde = el("input");
      tilde.type = "checkbox";
      tilde.checked = elegidas.has(r.id);
      tilde.setAttribute("aria-label", `Elegir: ${r.nota.titulo}`);
      tilde.addEventListener("change", () => { tilde.checked ? elegidas.add(r.id) : elegidas.delete(r.id); pintarSeleccion(); });
      item.append(tilde);
      item.classList.add("eligiendo");
    }
    const pie = el("p", "pie");
    pie.append(insignia(r.medio), document.createTextNode(r.medio.nombre),
      el("span", "gris", pestana === "tarde" ? `· para después de las ${hora(r.masTarde)}` : `· ${hora(r.nota.publicada || r.nota.fecha)}`));
    // Tocar el título abre la nota acá, en el lector del diario.
    const titulo = el("button", "titulo", r.nota.titulo);
    titulo.type = "button";
    titulo.addEventListener("click", () => (eligiendo ? elegirEsta() : abrirNota(r.id)));
    item.append(pie, titulo);
    if (r.destacados.length && pestana !== "tarde") {
      const ul = el("ul", "destacados");
      for (const d of r.destacados) {
        const li = el("li");
        const ir = el("button", "marca");
        ir.type = "button";
        ir.append(el("mark", null, d.texto));
        ir.setAttribute("aria-label", `Abrir la nota en esta marca: ${d.texto}`);
        ir.addEventListener("click", () => (eligiendo ? elegirEsta() : abrirNota(r.id, { marca: d.texto })));
        li.append(ir);
        if (pestana === "anotaciones" && !eligiendo) {
          const borrar = el("button", "borrar");
          borrar.type = "button";
          borrar.setAttribute("aria-label", `Desmarcar: ${d.texto}`);
          borrar.title = "Desmarcar";
          borrar.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
          borrar.addEventListener("click", async () => {
            r.destacados = r.destacados.filter((x) => x.texto !== d.texto);
            await persistir(r);
            dibujarPanel();
            avisar("Desmarcado");
          });
          li.append(borrar);
        }
        ul.append(li);
      }
      item.append(ul);
    }
    if (!eligiendo) {
      const acciones = el("div", "acciones");
      const c = el("button", null, "Compartir");
      c.type = "button";
      c.addEventListener("click", () => compartir([r.id], "compartir"));
      acciones.append(c);
      if (pestana === "anotaciones") {
        const todo = el("button", null, r.destacados.length > 1 ? "Desmarcar todo" : "Desmarcar");
        todo.type = "button";
        todo.addEventListener("click", async () => {
          r.destacados = [];
          await persistir(r);
          dibujarPanel();
          avisar("Desmarcada");
        });
        acciones.append(todo);
      } else {
        const q = el("button", null, "Quitar");
        q.type = "button";
        q.addEventListener("click", async () => {
          if (pestana === "guardadas") r.guardada = null; else r.masTarde = null;  // las marcas quedan en Anotaciones
          await persistir(r);
          dibujarPanel();
          avisar("Quitada");
        });
        acciones.append(q);
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
  pie.querySelector(".cuantas").textContent = elegidas.size ? `${elegidas.size} ${elegidas.size === 1 ? "elegida" : "elegidas"}` : "Elegí notas";
  for (const b of pie.querySelectorAll("button")) b.disabled = !elegidas.size;
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
