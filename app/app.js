/* el diario del pelado: arma las hojas de la edición, el pliegue para pasarlas,
   la línea de recorrido y el lector. Sin dependencias. */
"use strict";

const libro = document.getElementById("libro");
const recorrido = document.getElementById("recorrido");
const lector = document.getElementById("lector");
const aviso = document.getElementById("aviso");

const estado = {
  edicion: null,
  medios: new Map(),
  notas: new Map(),
  hojas: [],      // { el, seccion, notas: [ids] }
  actual: 0,
  modo: "",       // "telefono" | "tableta"
  orientacion: "",
  leidas: new Set(),
  ocupado: false,
};

const reducido = matchMedia("(prefers-reduced-motion: reduce)");
const horaFmt = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
const diaFmt = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" });

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
  const hoy = new Date();
  const mismoDia = d.toDateString() === hoy.toDateString();
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

/* ---------- piezas ---------- */
function pieza(id, variante) {
  const n = estado.notas.get(id);
  const m = estado.medios.get(n.medio);
  const p = el("article", `pieza ${variante}`);
  p.dataset.largo = largo(n.titulo);
  p.dataset.nota = id;
  p.style.cssText = colores(m);
  const conFoto = n.foto && variante !== "chica";
  if (conFoto) {
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
  pie.append(insignia(m), document.createTextNode(m.nombre));
  const detalle = [hora(n.publicada || n.fecha), `${n.minutos} min`].filter(Boolean).join(" · ");
  pie.append(el("span", "gris", `· ${detalle}`));
  if (n.a_medias) pie.append(el("span", "medias", "· a medias"));
  t.append(pie);
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
  datos.append(el("p", "cuenta", `${e.notas.length} notas de ${e.medios.length} medios`));
  const ins = el("div", "insignias");
  ins.setAttribute("aria-label", "Ir al cuaderno de cada medio");
  for (const m of e.medios) {
    const b = el("button", "insignia grande", m.linea.letra);
    b.type = "button";
    b.style.cssText = colores(m);
    b.setAttribute("aria-label", `Ir a ${m.nombre}`);
    b.addEventListener("click", () => irA(estado.hojas.findIndex((h) => h.seccion === m.id)));
    ins.append(b);
  }
  c.append(calco, datos, ins);
  return c;
}

function hojaTapa(ids) {
  const tableta = estado.modo === "tableta";
  const h = hojaBase("tapa con-recorrido", "Tapa");
  const lider = estado.medios.get(estado.notas.get(ids[0]).medio);
  const friso = el("div", "friso");
  friso.style.cssText = colores(lider);
  h.append(cartel(), friso);
  if (tableta) {
    const g = el("div", `grilla ${estado.orientacion === "vertical" ? "vertical" : "mosaico"}`);
    ids.forEach((id, i) => g.append(pieza(id, i === 0 ? "principal" : "normal")));
    h.append(g);
  } else {
    h.append(pieza(ids[0], "principal"));
  }
  return h;
}

function hojaNotas(ids, plantilla, etiqueta, medio) {
  const h = hojaBase(`${plantilla} con-recorrido`, etiqueta);
  // El friso de la pared del andén: el color de la línea en la que estás (la combinación en la portada).
  // Además ocupa la franja de la hora y la isla del iPhone, para que no tapen la foto ni el título.
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

function hojaApertura(cuaderno) {
  const m = estado.medios.get(cuaderno.medio);
  const h = hojaBase("apertura", `Cuaderno de ${m.nombre}`);
  h.style.cssText = colores(m);
  const enc = el("div", "encabezado");
  const placa = el("div", "placa");
  placa.append(insignia(m, "insignia"));
  enc.append(placa, el("h2", null, m.nombre));
  const ultima = estado.notas.get(cuaderno.notas[0]);
  enc.append(el("p", "resumen", `${cuaderno.notas.length} notas · la última, ${hora(ultima.publicada || ultima.fecha)}`));
  const lista = el("ol", "estaciones");
  for (const id of cuaderno.notas) {
    const n = estado.notas.get(id);
    const li = el("li");
    li.dataset.nota = id;
    const b = el("button");
    b.type = "button";
    b.append(el("span", null, n.titulo));
    b.addEventListener("click", () => abrirNota(id));
    li.append(b);
    lista.append(li);
  }
  h.append(enc, lista);
  return h;
}

function textoFinal(hoja) {
  const todas = estado.edicion.notas.every((n) => estado.leidas.has(n.id));
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

function armarHojas() {
  const e = estado.edicion;
  const tableta = estado.modo === "tableta";
  libro.replaceChildren();
  estado.hojas = [];
  const sumar = (elemento, seccion, ids) => {
    libro.append(elemento);
    estado.hojas.push({ el: elemento, seccion, notas: ids });
  };

  const portada = e.portada.slice();
  const enTapa = tableta ? 3 : 1;
  sumar(hojaTapa(portada.slice(0, enTapa)), "portada", portada.slice(0, enTapa));
  const patronPortada = tableta ? [["mosaico", 3], ["trio", 3], ["cuatro", 4]] : [["dos", 2], ["una", 1], ["tres", 3]];
  for (const t of trozos(portada.slice(enTapa), patronPortada)) {
    sumar(hojaNotas(t.ids, ajustar(t.plantilla, t.ids.length), "Portada", null), "portada", t.ids);
  }

  const patronCuaderno = tableta ? [["mosaico", 3], ["cuatro", 4], ["trio", 3]] : [["una", 1], ["dos", 2], ["tres", 3]];
  for (const c of e.cuadernos) {
    const m = estado.medios.get(c.medio);
    sumar(hojaApertura(c), c.medio, []);
    for (const t of trozos(c.notas, patronCuaderno)) {
      sumar(hojaNotas(t.ids, ajustar(t.plantilla, t.ids.length), m.nombre, m), c.medio, t.ids);
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

function pintarRecorrido() {
  const h = estado.hojas[estado.actual];
  const via = recorrido.querySelector(".via");
  const sobreColor = h.seccion === "fin" || h.el.classList.contains("apertura");
  recorrido.classList.toggle("sobre-color", sobreColor);
  const deSeccion = estado.hojas.map((x, i) => ({ ...x, i })).filter((x) => x.seccion === h.seccion && x.notas.length);
  const riel = el("div", "riel");
  if (h.seccion === "portada") {
    riel.classList.add("combinacion");
    recorrido.style.setProperty("--linea", "#16181D");
  } else if (h.seccion !== "fin") {
    recorrido.style.setProperty("--linea", estado.medios.get(h.seccion).linea.color);
  }
  via.replaceChildren(riel);
  deSeccion.forEach((x, k) => {
    const est = el("span", `estacion ${marcaDeHoja(x)}`);
    if (x.i === estado.actual) est.classList.add("aca");
    est.style.left = deSeccion.length > 1 ? `${(k / (deSeccion.length - 1)) * 100}%` : "0%";
    via.append(est);
  });
  const pos = deSeccion.findIndex((x) => x.i === estado.actual) + 1;
  const nombre = h.seccion === "portada" ? "Portada" : h.seccion === "fin" ? "" : estado.medios.get(h.seccion).nombre;
  recorrido.querySelector(".donde").innerHTML = "";
  if (pos) recorrido.querySelector(".donde").append(Object.assign(el("b"), { textContent: nombre }), document.createTextNode(` · estación ${pos} de ${deSeccion.length}`));
  const siguiente = estado.hojas.slice(estado.actual + 1).find((x) => x.seccion !== h.seccion);
  const prox = recorrido.querySelector(".proxima-seccion");
  prox.textContent = estado.actual === 0 ? "Pasá la hoja" : siguiente && pos === deSeccion.length && siguiente.seccion !== "fin"
    ? `Próxima: ${estado.medios.get(siguiente.seccion).nombre}` : "";
}

function pintarAperturas() {
  for (const li of libro.querySelectorAll(".estaciones li")) {
    const id = li.dataset.nota;
    li.classList.toggle("leida", estado.leidas.has(id) && !estado.notas.get(id).a_medias);
    li.classList.toggle("a-medias", estado.leidas.has(id) && estado.notas.get(id).a_medias);
  }
}

/* ---------- mostrar una hoja ---------- */
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
  guardarMemoria("posicion", { edicion: estado.edicion.generada, hoja: i, modo: estado.modo });
}

function irA(i) {
  if (i < 0 || i === estado.actual) return;
  if (reducido.matches || Math.abs(i - estado.actual) > 1) {
    mostrar(i);
    return;
  }
  pasar(i > estado.actual ? 1 : -1);
}

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
      const t = a / 180;
      sombraFrente.style.opacity = a < 90 ? (0.38 * (a / 90)).toFixed(3) : "0";
      sombraDorso.style.opacity = a >= 90 ? (0.38 * (1 - (a - 90) / 90)).toFixed(3) : "0";
      sombraBase.style.opacity = (0.32 * (1 - t)).toFixed(3);
    },
    cerrar(completo) {
      pliegue.remove();
      if (completo) {
        mostrar(estado.actual + sentido);
      } else {
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
  if (estado.ocupado || ev.button !== 0) return;
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
    if (destino < 0 || destino >= estado.hojas.length || reducido.matches) {
      gesto.rebote = true;
    } else {
      gesto.pliegue = crearPliegue(gesto.sentido);
    }
  }
  if (gesto.pliegue) {
    const largoEje = horizontal ? libro.clientWidth : libro.clientHeight;
    const avance = Math.max(0, Math.min(1, (-gesto.sentido * delta) / (largoEje * 0.8)));
    gesto.pliegue.pintar(avance * 180);
    gesto.ultimo = { delta, t: ev.timeStamp };
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
  const dt = Math.max(1, ev.timeStamp - g.t);
  const velocidad = (-g.sentido * delta) / dt; // px por ms a favor del pase
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

document.addEventListener("keydown", (ev) => {
  if (lector.classList.contains("abierto")) {
    if (ev.key === "Escape") cerrarNota();
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

function abrirNota(id, { sinAnimacion = false } = {}) {
  const n = estado.notas.get(id);
  const m = estado.medios.get(n.medio);
  lector.style.setProperty("--linea", m.linea.color);
  lector.style.setProperty("--linea-tinta", m.linea.tinta);

  const barra = lector.querySelector(".barra .medio");
  barra.replaceChildren(insignia(m), document.createTextNode(` ${m.nombre} `), el("span", null, `· ${[hora(n.publicada || n.fecha), `${n.minutos} min`].filter(Boolean).join(" · ")}`));
  barra.querySelector(".insignia").style.marginRight = "4px";
  barra.querySelector(".insignia").style.verticalAlign = "-7px";
  lector.querySelector(".enlace-original").href = n.url;

  const art = lector.querySelector("article");
  art.replaceChildren();
  art.append(el("h1", null, n.titulo));
  if (n.bajada) art.append(el("p", "bajada", n.bajada));
  const firma = [n.autor, hora(n.fecha || n.publicada)].filter(Boolean).join(" · ");
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
    const aviso = el("p", "medias");
    aviso.append(el("b", null, "Nota a medias. "), document.createTextNode(`${m.nombre} sólo deja leer el comienzo desde acá. La nota completa está en su sitio.`));
    art.append(aviso);
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
  original.append(document.createTextNode(n.a_medias ? `Seguir leyendo en ${m.nombre}` : `Ver la nota en ${m.nombre}`));
  original.insertAdjacentHTML("beforeend", '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>');
  cierre.append(original);
  const cuaderno = estado.edicion.cuadernos.find((c) => c.medio === n.medio);
  const sig = cuaderno && cuaderno.notas[cuaderno.notas.indexOf(id) + 1];
  if (sig) {
    const b = el("button", "proxima");
    b.type = "button";
    const titulo = estado.notas.get(sig).titulo;
    b.setAttribute("aria-label", `Próxima nota de ${m.nombre}: ${titulo}`);
    b.append(el("span", null, titulo));
    b.insertAdjacentHTML("beforeend", '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>');
    b.addEventListener("click", () => { lector.scrollTo({ top: 0 }); abrirNota(sig); });
    cierre.append(b);
  }

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
  libro.inert = true;
  recorrido.inert = true;
  lector.querySelector("button.cerrar").focus({ preventScroll: true });

  estado.leidas.add(id);
  guardarMemoria("leidas", [...estado.leidas].slice(-600));
  pintarAperturas();
  pintarRecorrido();
}

function cerrarNota() {
  lector.classList.remove("abierto");
  libro.inert = false;
  recorrido.inert = false;
  const fin = () => { if (!lector.classList.contains("abierto")) lector.hidden = true; };
  if (reducido.matches) fin(); else setTimeout(fin, 440);
}
lector.querySelector("button.cerrar").addEventListener("click", cerrarNota);

/* ---------- tamaño: teléfono o tableta, y la orientación ---------- */
function medir() {
  // Tableta (o compu) cuando entran dos columnas de notas con aire; el teléfono acostado sigue siendo teléfono.
  const tableta = innerWidth >= 700 && innerHeight >= 600;
  return { modo: tableta ? "tableta" : "telefono", orientacion: innerWidth >= innerHeight ? "horizontal" : "vertical" };
}

function rearmar(conservar) {
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

function baseDeClaves() {
  return new Promise((ok, mal) => {
    const r = indexedDB.open("diario-del-pelado", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("claves");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
}
async function claveGuardada() {
  try {
    const db = await baseDeClaves();
    return await new Promise((ok) => {
      const r = db.transaction("claves").objectStore("claves").get("edicion");
      r.onsuccess = () => ok(r.result || null);
      r.onerror = () => ok(null);
    });
  } catch { return null; }
}
async function guardarClave(clave) {
  try {
    const db = await baseDeClaves();
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
  try {
    const edicion = await abrirSobre(await traerSobre(), estado.clave);
    montar(edicion);
    estado.modo = "";          // fuerza a rearmar las hojas con la edición nueva
    rearmar(true);
    aviso.textContent = `Edición de las ${horaFmt.format(new Date(edicion.generada))} lista.`;
  } catch { /* si falla, queda la que había */ }
  setTimeout(() => { botonNueva.hidden = true; }, 450);
});

/* ---------- arranque ---------- */
async function iniciar() {
  montar(await cargarEdicion());
  estado.leidas = new Set(leerMemoria("leidas", []));
  rearmar(false);
  // Volver a la estación donde te bajaste, si es la misma edición.
  const pos = leerMemoria("posicion", null);
  if (pos && pos.edicion === estado.edicion.generada && pos.modo === estado.modo) mostrar(pos.hoja);
  // Enlaces directos: #hoja=N abre esa hoja; #nota=ID, esa nota en el lector.
  const ancla = new URLSearchParams(location.hash.slice(1));
  if (ancla.has("hoja")) mostrar(Number(ancla.get("hoja")));
  if (ancla.has("seccion")) mostrar(Math.max(0, estado.hojas.findIndex((h) => h.seccion === ancla.get("seccion"))));
  if (ancla.has("nota") && estado.notas.has(ancla.get("nota"))) abrirNota(ancla.get("nota"), { sinAnimacion: true });
  aviso.textContent = `Edición de las ${horaFmt.format(new Date(estado.edicion.generada))} lista.`;

  // Con la app abierta, cada 5 minutos y al volver a ella se fija si hay edición nueva.
  setInterval(revisarEdicion, 5 * 60 * 1000);
  document.addEventListener("visibilitychange", revisarEdicion);
  if ("serviceWorker" in navigator && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

iniciar().catch((err) => {
  libro.replaceChildren();
  const h = el("section", "hoja terminal");
  h.append(el("h2", null, "Sin edición."), el("p", null, `${err.message}. Probá de nuevo en un rato.`));
  libro.append(h);
  recorrido.hidden = true;
});
