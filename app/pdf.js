/* el diario del pelado · exportar en PDF (spec-marcas §5.2 y §5.3).
   Se carga a pedido: app.js inyecta <script src="pdf.js"> y después usa
     window.diarioPdf.cargar(): Promise<void>    jsPDF vendorizado + las 6 TTF; memorizada
     window.diarioPdf.armar(modelo, modo): Blob   sincrónico; modo "marcas" | "completa"
   No toca el DOM de la app: sólo agrega el <script> de jsPDF y usa un <canvas> suelto para los emojis.
   Lo único que se altera del texto del medio:
   - una letra que no está en la fuente pasa a su letra base (ğ → g), a un equivalente chico (ł → l)
     o se omite;
   - un emoji va como imagen dibujada por el sistema, o se omite si no se puede dibujar. */
(function () {
  "use strict";

  const BASE = new URL(".", (document.currentScript && document.currentScript.src) || location.href).href;
  const JSPDF = "vendor/jspdf-4.2.1.umd.min.js";
  // [archivo, familia]; el índice es la clave de F. Cada una con familia propia: jsPDF usa la familia
  // como nombre de la fuente dentro del PDF, y dos fuentes distintas con el mismo nombre confunden a
  // algunos visores.
  const FUENTES = [
    ["archivo-titulo.ttf", "ArchivoTitulo"],      // wght 740, wdth 90
    ["archivo-dato.ttf", "ArchivoDato"],          // wght 600
    ["archivo-apunte.ttf", "ArchivoApunte"],      // wght 500
    ["alegreya.ttf", "AlegreyaTexto"],
    ["alegreya-negrita.ttf", "AlegreyaNegrita"],
    ["alegreya-italica.ttf", "AlegreyaItalica"],
  ];
  const F = { titulo: 0, dato: 1, apunte: 2, texto: 3, negrita: 4, italica: 5 };

  // Papel claro siempre, también con el equipo de noche.
  const TINTA = "#16181D", GRIS = "#50535B", JUNTA = "#DCDCD6", AZULEJO = "#F7F7F4";
  const MARCAS = {                      // [fondo claro, trazo]
    amarillo: ["#FBE38E", "#A88000"],
    verde: ["#CDEBB6", "#4E9A2E"],
    celeste: ["#C4E2F6", "#2F86C2"],
    rosa: ["#F8CCDC", "#D04A80"],
  };
  const colorMarca = (c) => (MARCAS[c] ? c : "amarillo");

  // A4 en pt: 56 a los costados, 60 arriba, 64 abajo; columna de 483.
  const PAG = { ancho: 595.28, alto: 841.89, izq: 56, der: 56, arriba: 60, abajo: 64 };
  const COL = PAG.ancho - PAG.izq - PAG.der;
  const LIMITE = PAG.alto - PAG.abajo;
  const UTIL = LIMITE - PAG.arriba;
  const EMOJI = 1.1;                    // un emoji ocupa 1,1 em en el renglón

  const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre",
    "octubre", "noviembre", "diciembre"];

  /* ---------- carga (memorizada) ---------- */

  let carga = null;
  let base64 = null;                    // las 6 TTF en base64, en el orden de FUENTES

  function cargarScript(src) {
    return new Promise((ok, mal) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => ok();
      s.onerror = () => { s.remove(); mal(new Error("No se pudo cargar jsPDF.")); };
      document.head.appendChild(s);
    });
  }

  async function traerFuente(nombre) {
    let r;
    try { r = await fetch(BASE + "fuentes/pdf/" + nombre); } catch (e) { r = null; }
    if (!r || !r.ok) throw new Error(`No se pudo traer la fuente ${nombre}.`);
    const bytes = new Uint8Array(await r.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  function cargar() {
    if (!carga) {
      carga = Promise.all([
        window.jspdf && window.jspdf.jsPDF ? null : cargarScript(BASE + JSPDF),
        Promise.all(FUENTES.map((f) => traerFuente(f[0]))),
      ]).then((r) => {
        if (!window.jspdf || !window.jspdf.jsPDF) throw new Error("jsPDF no quedó disponible.");
        base64 = r[1];
        emojiPng("🔴");                 // calienta la fuente de emojis del sistema: el toque de armar no la espera
      }).catch((e) => {
        carga = null;                   // el próximo intento vuelve a probar
        throw new Error("No se pudo preparar el PDF en este equipo. " + ((e && e.message) || ""));
      });
    }
    return carga;
  }

  /* ---------- letras: NFC, letra base, mapa chico u omitir; nunca las fuentes estándar ---------- */

  const BLANCOS = /[\t\n\v\f\r \u1680\u2000-\u200A\u2028\u2029\u205F\u3000]/;   // no incluye el espacio duro
  const INVISIBLES = /[\u00AD\u034F\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFE00-\uFE0F\uFEFF]/;
  const POSIBLE_EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u;
  const SIN_EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u20E3\uFE0F\u200D]|\p{Emoji_Modifier}/gu;
  const MAPA = {
    "ł": "l", "Ł": "L", "đ": "d", "Đ": "D", "ø": "o", "Ø": "O", "ı": "i", "ħ": "h", "Ħ": "H",
    "ß": "ss", "æ": "ae", "Æ": "AE", "œ": "oe", "Œ": "OE", "þ": "th", "Þ": "Th", "ð": "d", "Ð": "D",
    "\u202F": "\u00A0", "\u2011": "-", "\u2010": "-", "\u2212": "-", "\u2032": "'", "\u2033": "\"",
    "→": "->", "←": "<-", "≈": "~",
  };
  const SEG = typeof Intl === "object" && Intl.Segmenter ? new Intl.Segmenter("es", { granularity: "grapheme" }) : null;
  const GRAFEMA = /\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?(?:\u200D\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?)*|\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|[\s\S]/gu;
  const grafemas = (t) => (SEG ? Array.from(SEG.segment(t), (s) => s.segment) : t.match(GRAFEMA) || []);
  const sinMarcas = (s) => s.normalize("NFD").replace(/\p{M}/gu, "");

  const LETRAS = FUENTES.map(() => new Map());   // por fuente: letra → reemplazo ("" = se omite)
  const AVANCES = FUENTES.map(() => new Map());  // por fuente: letra → avance en em

  function letra(fu, c, saltos) {
    if (c === "\n") return saltos ? "\n" : " ";
    if (BLANCOS.test(c)) return " ";
    if (INVISIBLES.test(c)) return "";
    let r = fu.letras.get(c);
    if (r !== undefined) return r;
    const entra = (s) => !!s && Array.from(s).every((x) => fu.tiene(x.codePointAt(0)));
    if (fu.tiene(c.codePointAt(0))) r = c;
    else if (entra(sinMarcas(c))) r = sinMarcas(c);
    else if (entra(MAPA[c])) r = MAPA[c];
    else if (entra(c.normalize("NFKC"))) r = c.normalize("NFKC");
    else if (entra(sinMarcas(c.normalize("NFKC")))) r = sinMarcas(c.normalize("NFKC"));
    else r = "";
    fu.letras.set(c, r);
    return r;
  }

  // Emojis: dibujados por el sistema en un canvas de 64×64; si no se puede, se omiten.
  const EMOJIS = new Map();
  function emojiPng(g) {
    if (EMOJIS.has(g)) return EMOJIS.get(g);
    let png = null;
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const x = c.getContext("2d");
      x.font = '54px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      x.textAlign = "center";
      x.textBaseline = "alphabetic";
      const m = x.measureText(g);
      const sube = m.actualBoundingBoxAscent || 46, baja = m.actualBoundingBoxDescent || 8;
      x.fillText(g, 32, 32 + (sube - baja) / 2);
      const px = x.getImageData(0, 0, 64, 64).data;
      let hay = false;
      for (let i = 3; i < px.length; i += 4) if (px[i]) { hay = true; break; }
      if (hay) png = c.toDataURL("image/png");
    } catch (e) {
      png = null;
    }
    EMOJIS.set(g, png);
    return png;
  }

  // Un texto listo para la fuente: [cadena | { emoji }], con " " como único blanco y "\n" si saltos.
  function piezas(texto, fu, saltos) {
    const out = [];
    let buf = "";
    const t = String(texto == null ? "" : texto).normalize("NFC").replace(/\r\n?/g, "\n");
    for (const g of POSIBLE_EMOJI.test(t) ? grafemas(t) : t) {
      if (POSIBLE_EMOJI.test(g)) {
        const sola = g.replace(/\uFE0E/g, "");
        if (Array.from(sola).length === 1 && g.indexOf("\uFE0F") < 0 && fu.tiene(sola.codePointAt(0))) { buf += sola; continue; } // © ® ™
        if (emojiPng(g)) {
          if (buf) out.push(buf);
          buf = "";
          out.push({ emoji: g });
        }
        continue;
      }
      for (const c of g) buf += letra(fu, c, saltos);
    }
    if (buf) out.push(buf);
    return out;
  }

  const textoSimple = (cx, s, f) => piezas(s, cx.fu[f], false).filter((p) => typeof p === "string").join("").replace(/ +/g, " ").trim();

  // Info del PDF (título): jsPDF lo escribe en bytes, así que va en UTF-16BE con BOM.
  function textoInfo(s) {
    s = String(s || "").normalize("NFC").replace(SIN_EMOJI, "").replace(/\s+/g, " ").trim();
    if (/^[\x20-\x7E]*$/.test(s)) return s;
    let r = "\u00FE\u00FF";
    for (let c of s) {
      if (c.codePointAt(0) > 0xFFFF) continue;
      let u = c.charCodeAt(0);
      if ((u & 0xFF) === 0x0D || u >> 8 === 0x0D) {      // un CR suelto en un string del PDF se lee como LF
        c = sinMarcas(c).charAt(0);
        u = c.charCodeAt(0);
        if (!c || (u & 0xFF) === 0x0D || u >> 8 === 0x0D) continue;
      }
      r += String.fromCharCode(u >> 8, u & 0xFF);
    }
    return r;
  }

  /* ---------- documento ---------- */

  function nuevoDoc() {
    // putOnlyUsedFonts: sin las 14 fuentes estándar que jsPDF declara siempre
    const doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4", compress: true, putOnlyUsedFonts: true });
    FUENTES.forEach(([archivo, familia], i) => {
      doc.addFileToVFS(archivo, base64[i]);
      doc.addFont(archivo, familia, "normal", undefined, "Identity-H");
    });
    const fu = FUENTES.map(([, familia], i) => {
      doc.setFont(familia, "normal");
      const meta = doc.getFont().metadata;
      const av = AVANCES[i];
      return {
        familia, estilo: "normal", letras: LETRAS[i],
        tiene: (cp) => cp <= 0xFFFF && meta.characterToGlyph(cp) > 0,
        ancho(s, tam) {
          let w = 0;
          for (const c of s) {
            let a = av.get(c);
            if (a === undefined) { a = meta.widthOfGlyph(meta.characterToGlyph(c.charCodeAt(0))) / 1000; av.set(c, a); }
            w += a;
          }
          return w * tam;
        },
      };
    });
    const cx = { doc, fu, y: PAG.arriba, pag: 1 };
    cx.nueva = () => { doc.addPage(); cx.pag++; cx.y = PAG.arriba; };
    // si no entra `alto` en lo que queda de la página, a la próxima (nunca deja una página vacía)
    cx.lugar = (alto) => {
      if (cx.y + alto > LIMITE + 0.01 && cx.y > PAG.arriba + 0.01) { cx.nueva(); return true; }
      return false;
    };
    cx.aire = (n) => { if (cx.y > PAG.arriba + 0.01) cx.y += n; };   // el aire no pasa de página
    cx.letra = (f, tam, color) => { doc.setFont(fu[f].familia, fu[f].estilo); doc.setFontSize(tam); doc.setTextColor(color || TINTA); };
    return cx;
  }

  /* ---------- composición de renglones ---------- */

  // run = { t, f, tam, color?, marca?, href?, cortable?, saltos? }
  // → ítems: { tipo:"pal", frags:[{ run, t, w, emoji }], w } | { tipo:"esp", run, w } | { tipo:"salto" }
  // Una palabra puede juntar trozos de varios runs (negrita pegada a una coma): no se corta entre ellos.
  function palabras(cx, runs) {
    const items = [];
    let pal = null;
    const cerrar = () => { if (pal) items.push(pal); pal = null; };
    const agregar = (run, t, emoji) => {
      const w = emoji ? run.tam * EMOJI : cx.fu[run.f].ancho(t, run.tam);
      if (!pal) pal = { tipo: "pal", frags: [], w: 0 };
      const ult = pal.frags[pal.frags.length - 1];
      if (!emoji && ult && ult.run === run && !ult.emoji) { ult.t += t; ult.w += w; } else pal.frags.push({ run, t, w, emoji });
      pal.w += w;
    };
    for (const run of runs) {
      if (!run || !run.t) continue;
      for (const p of piezas(run.t, cx.fu[run.f], run.saltos)) {
        if (typeof p !== "string") { agregar(run, p.emoji, true); continue; }
        for (const trozo of p.split(/( +|\n)/)) {
          if (!trozo) continue;
          if (trozo === "\n") { cerrar(); items.push({ tipo: "salto" }); continue; }
          if (trozo.charAt(0) === " ") {
            cerrar();
            const ult = items[items.length - 1];
            if (ult && ult.tipo !== "esp") items.push({ tipo: "esp", run, w: cx.fu[run.f].ancho(" ", run.tam) });
            continue;
          }
          if (run.cortable) {                          // una dirección: se puede cortar después de / - . ? & = _ #
            for (const s of trozo.replace(/([/\-?&=_.#])/g, "$1\u0000").split("\u0000")) if (s) { agregar(run, s); cerrar(); }
          } else agregar(run, trozo);
        }
      }
    }
    cerrar();
    return items;
  }

  // Corte voraz por espacios. Una palabra más ancha que la columna (una dirección) se corta por letras.
  function componer(cx, items, ancho) {
    const lineas = [];
    let l = [], x = 0;
    const cerrar = () => {
      while (l.length && l[l.length - 1].esp) x -= l.pop().w;
      lineas.push(l);
      l = []; x = 0;
    };
    const poner = (f) => { l.push({ run: f.run, t: f.t, w: f.w, emoji: f.emoji, esp: f.esp, x }); x += f.w; };
    for (const it of items) {
      if (it.tipo === "salto") { cerrar(); continue; }
      if (it.tipo === "esp") { if (l.length && !l[l.length - 1].esp) poner({ run: it.run, t: " ", w: it.w, esp: true }); continue; }
      if (x + it.w > ancho + 0.01 && l.some((s) => !s.esp)) cerrar();
      if (it.w <= ancho + 0.01) { it.frags.forEach(poner); continue; }
      for (const f of it.frags) {
        if (f.emoji) { if (x + f.w > ancho && l.length) cerrar(); poner(f); continue; }
        let t = "", w = 0;
        for (const c of f.t) {
          const wc = cx.fu[f.run.f].ancho(c, f.run.tam);
          if (x + w + wc > ancho + 0.01 && (t || l.length)) {
            if (t) poner({ run: f.run, t, w });
            cerrar();
            t = ""; w = 0;
          }
          t += c; w += wc;
        }
        if (t) poner({ run: f.run, t, w });
      }
    }
    if (l.length) cerrar();
    while (lineas.length && !lineas[lineas.length - 1].length) lineas.pop();
    return lineas;
  }

  const lineasDe = (cx, runs, ancho) => componer(cx, palabras(cx, runs), ancho);
  const baseDe = (y, tam, inter) => y + inter / 2 + 0.3 * tam;
  const mismoEstilo = (a, b) => a.f === b.f && a.tam === b.tam && (a.color || TINTA) === (b.color || TINTA);

  function codigos(g) { return Array.from(g, (c) => c.codePointAt(0).toString(16)).join("-"); }

  // Un renglón: primero los fondos de las marcas, después el texto (un text() por estilo, con sus
  // espacios, para que se copie bien), los emojis y los vínculos.
  function pintar(cx, l, x0, y, tam, inter, opc) {
    const doc = cx.doc, base = baseDe(y, tam, inter);
    for (let i = 0; i < l.length;) {
      const m = l[i].run.marca;
      if (!m || l[i].esp) { i++; continue; }
      let j = i, k = i;
      while (k + 1 < l.length && l[k + 1].run.marca === m) { k++; if (!l[k].esp) j = k; }
      doc.setFillColor(MARCAS[m][0]);
      doc.rect(x0 + l[i].x - 1.5, base - 0.8 * tam, l[j].x + l[j].w - l[i].x + 3, 1.06 * tam, "F");
      i = k + 1;
    }
    for (let i = 0; i < l.length;) {
      const s = l[i];
      if (s.emoji) {
        const lado = s.run.tam * 0.94;
        try {
          doc.addImage(emojiPng(s.t), "PNG", x0 + s.x + (s.w - lado) / 2, base - 0.36 * s.run.tam - lado / 2, lado, lado, "emoji-" + codigos(s.t));
        } catch (e) { /* si falla, se omite */ }
        i++;
        continue;
      }
      let t = s.t, j = i + 1;
      while (j < l.length && !l[j].emoji && mismoEstilo(l[j].run, s.run)) t += l[j++].t;
      if (t.trim()) { cx.letra(s.run.f, s.run.tam, s.run.color); doc.text(t, x0 + s.x, base); }
      i = j;
    }
    for (let i = 0; i < l.length;) {
      const h = l[i].run.href;
      if (!h || l[i].esp) { i++; continue; }
      let j = i, k = i;
      while (k + 1 < l.length && l[k + 1].run.href === h) { k++; if (!l[k].esp) j = k; }
      const desde = x0 + l[i].x, ancho = l[j].x + l[j].w - l[i].x;
      doc.link(desde, y, ancho, inter, { url: h });
      if (opc && opc.subrayado && !l[i].run.sinSubrayado) {
        doc.setDrawColor(opc.subrayado);
        doc.setLineWidth(0.75);
        doc.line(desde, base + 0.16 * tam, desde + ancho, base + 0.16 * tam);
      }
      i = k + 1;
    }
  }

  // Dibuja renglones desde cx.y, pasando de página renglón a renglón. Devuelve lo ocupado por página
  // (para las rayas de citas y apuntes). opc.antes(i) corre antes de cada renglón (reglas de página).
  function renglones(cx, lineas, x0, tam, inter, opc) {
    const ocupado = [];
    lineas.forEach((l, i) => {
      if (opc && opc.antes) opc.antes(i);
      cx.lugar(inter);
      if (l.length) pintar(cx, l, x0, cx.y, tam, inter, opc);
      const u = ocupado[ocupado.length - 1];
      if (u && u.pag === cx.pag) u.y1 = cx.y + inter; else ocupado.push({ pag: cx.pag, y0: cx.y, y1: cx.y + inter });
      cx.y += inter;
    });
    return ocupado;
  }

  // Raya vertical (apuntes: trazo de la marca; citas: color de la línea), página por página.
  function raya(cx, ocupado, x, color, recorte) {
    const doc = cx.doc, actual = cx.pag;
    for (const o of ocupado) {
      doc.setPage(o.pag);
      doc.setFillColor(color);
      doc.rect(x, o.y0 + recorte, 2.5, o.y1 - o.y0 - 2 * recorte, "F");
    }
    doc.setPage(actual);
  }

  /* ---------- piezas comunes ---------- */

  const hex = (c, otro) => (/^#[0-9a-f]{6}$/i.test(c || "") ? c : otro);

  function insignia(cx, medio, x, cy) {
    const doc = cx.doc;
    doc.setFillColor(hex(medio.color, GRIS));
    doc.circle(x + 6, cy, 6, "F");
    const letraM = textoSimple(cx, medio.letra || "", F.titulo);
    if (!letraM) return;
    const tam = letraM.length > 1 ? 5.1 : 5.6;          // 46 % del diámetro; un poco menos con dos cifras
    const w = cx.fu[F.titulo].ancho(letraM, tam);
    cx.letra(F.titulo, tam, hex(medio.tinta, "#FFFFFF"));
    doc.text(letraM, x + 6 - w / 2, cy + 0.36 * tam);
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function fechaDe(iso) {                // «martes 21 de octubre, 16:43»
    if (!iso) return null;
    const s = String(iso);
    const soloDia = /^\d{4}-\d{2}-\d{2}$/.test(s);
    const d = soloDia ? new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) : new Date(s);
    return isNaN(d) ? null : { d, soloDia };
  }
  function fechaNota(iso, anioExport) {
    const f = fechaDe(iso);
    if (!f) return "";
    const d = f.d;
    let t = `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
    if (d.getFullYear() !== anioExport) t += ` de ${d.getFullYear()}`;
    return f.soloDia ? t : `${t}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  function fechaExport(iso) {            // «22 de octubre de 2026»: el día que dice el texto (hora local de quien exporta)
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
    const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date();
    return { texto: `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`, anio: d.getFullYear() };
  }

  // La etiqueta: insignia y «Medio · …» en Archivo 600 9 pt gris.
  function etiqueta(cx, medio, texto) {
    const lineas = lineasDe(cx, [{ t: texto, f: F.dato, tam: 9, color: GRIS }], COL - 17);
    const alto = Math.max(12, lineas.length * 12);
    cx.lugar(alto);
    const y0 = cx.y;
    insignia(cx, medio, PAG.izq, y0 + 6);
    lineas.forEach((l, i) => pintar(cx, l, PAG.izq + 17, y0 + i * 12, 9, 12));
    cx.y = y0 + alto;
  }
  const altoEtiqueta = (cx, texto) => Math.max(12, lineasDe(cx, [{ t: texto, f: F.dato, tam: 9 }], COL - 17).length * 12);

  function original(cx, url) {
    if (!/^https?:\/\//i.test(url || "")) return;
    let visible = url.replace(/^https?:\/\/(www\.)?/i, "");
    try { visible = decodeURI(visible); } catch (e) { /* se queda como vino */ }
    renglones(cx, lineasDe(cx, [
      { t: "Original: ", f: F.dato, tam: 8.5, color: GRIS, href: url },
      { t: visible, f: F.dato, tam: 8.5, color: GRIS, href: url, cortable: true },
    ], COL), PAG.izq, 8.5, 11.5);
  }

  const runTitulo = (n, tam) => [{ t: n.titulo || "Sin título", f: F.titulo, tam, href: /^https?:/i.test(n.url || "") ? n.url : null }];

  // Una marca suelta (modo «marcas» y marcas perdidas): el texto con su fondo y, 4 pt debajo, el apunte
  // con 10 pt de sangría, raya del trazo y Archivo 500 10/14. La marca y su apunte no se parten.
  function prepararMarca(cx, m, tam, inter, perdida) {
    const c = colorMarca(m.color);
    const lineas = lineasDe(cx, [{ t: m.texto, f: F.texto, tam, marca: c }], COL);
    const aviso = perdida ? lineasDe(cx, [{ t: "Ya no está en el texto de la nota.", f: F.dato, tam: 8.5, color: GRIS }], COL) : [];
    const ap = String(m.apunte || "").trim();
    const apunte = ap ? lineasDe(cx, [{ t: ap, f: F.apunte, tam: 10, saltos: true }], COL - 10) : [];
    const alto = lineas.length * inter + (aviso.length ? 2 + aviso.length * 11.5 : 0) + (apunte.length ? 4 + apunte.length * 14 : 0);
    return { c, lineas, aviso, apunte, alto, tam, inter };
  }
  function dibujarMarca(cx, p) {
    if (p.alto <= UTIL) cx.lugar(p.alto);
    renglones(cx, p.lineas, PAG.izq, p.tam, p.inter);
    if (p.aviso.length) { cx.y += 2; renglones(cx, p.aviso, PAG.izq, 8.5, 11.5); }
    if (p.apunte.length) dibujarApunte(cx, p.apunte, p.c, PAG.izq);
  }
  function dibujarApunte(cx, lineas, c, x0) {
    cx.y += 4;
    raya(cx, renglones(cx, lineas, x0 + 10, 10, 14), x0, MARCAS[c][1], 2.5);
  }

  /* ---------- «Título y marcas» ---------- */

  function armarMarcas(cx, notas, anio) {
    notas.forEach((n, k) => {
      const titulo = lineasDe(cx, runTitulo(n, 19), COL);
      const textoEtiqueta = [n.medio.nombre, fechaNota(n.fecha, anio)].filter(Boolean).join(" · ");
      const lista = (n.marcas || []).map((m) => prepararMarca(cx, m, 12, 18, false))
        .concat((n.perdidas || []).map((m) => prepararMarca(cx, m, 12, 18, true)));
      // el título, la etiqueta y la primera marca no se separan; una nota no empieza en los últimos 120 pt
      const cabeza = titulo.length * 22 + 6 + altoEtiqueta(cx, textoEtiqueta) + 12 + (lista[0] ? lista[0].alto : 0);
      const pide = Math.min(UTIL, Math.max(120, cabeza));
      if (k > 0) {
        if (cx.y + 36.75 + pide > LIMITE) cx.nueva();     // en página nueva no hace falta la junta
        else {
          cx.y += 18;
          cx.doc.setDrawColor(JUNTA);
          cx.doc.setLineWidth(0.75);
          cx.doc.line(PAG.izq, cx.y + 0.375, PAG.ancho - PAG.der, cx.y + 0.375);
          cx.y += 18.75;
        }
      } else cx.lugar(pide);
      renglones(cx, titulo, PAG.izq, 19, 22);
      cx.y += 6;
      etiqueta(cx, n.medio, textoEtiqueta);
      cx.y += 12;
      lista.forEach((p) => { dibujarMarca(cx, p); cx.y += 10; });
      original(cx, n.url);
    });
  }

  /* ---------- «Nota completa» ---------- */

  const ESTILOS = {
    p: { tam: 11.5, inter: 17.3, sangria: 0, fuente: (t) => (t.negrita ? F.negrita : t.italica ? F.italica : F.texto) },
    h: { tam: 13.5, inter: 16.5, sangria: 0, fuente: () => F.titulo },
    cita: { tam: 12.5, inter: 18, sangria: 18, fuente: () => F.italica },
    li: { tam: 11.5, inter: 17.3, sangria: 14, fuente: (t) => (t.negrita ? F.negrita : t.italica ? F.italica : F.texto) },
    epigrafe: { tam: 9, inter: 13, sangria: 0, color: GRIS, fuente: (t) => (t.negrita ? F.titulo : F.dato) },
    fila: { tam: 9.5, inter: 13.5, sangria: 0, fuente: () => F.dato },
  };
  function aireAntes(previo, tipo) {
    if (!previo) return 0;
    if (tipo === "h") return 14;
    if (previo === "h") return 5;
    if (tipo === "li" && previo === "li") return 3;
    if (tipo === "fila" && previo === "fila") return 2;
    return 8;
  }

  function aMedias(cx, medio) {
    const runs = [
      { t: "Nota a medias. ", f: F.titulo, tam: 9.5 },
      { t: `${medio.nombre || "El medio"} sólo deja leer el comienzo desde acá. La nota completa está en su sitio.`, f: F.apunte, tam: 9.5 },
    ];
    const lineas = lineasDe(cx, runs, COL - 24);
    const alto = lineas.length * 13.5 + 16;
    cx.lugar(alto);
    const y0 = cx.y;
    cx.doc.setFillColor(AZULEJO);
    cx.doc.setDrawColor(JUNTA);
    cx.doc.setLineWidth(0.75);
    cx.doc.rect(PAG.izq + 0.375, y0 + 0.375, COL - 0.75, alto - 0.75, "FD");
    lineas.forEach((l, i) => pintar(cx, l, PAG.izq + 12, y0 + 8 + i * 13.5, 9.5, 13.5));
    cx.y = y0 + alto;
  }

  function bloque(cx, b, medio, previo) {
    const tipo = ESTILOS[b.tipo] ? b.tipo : "p";
    const est = ESTILOS[tipo];
    const tramos = Array.isArray(b.tramos) ? b.tramos : [];
    const apuntes = (Array.isArray(b.apuntes) ? b.apuntes : []).filter((a) => a && String(a.texto || "").trim());
    if (tipo === "epigrafe" && !tramos.some((t) => t && t.marca) && !apuntes.length) return previo;   // sólo con marca
    const runs = tipo === "fila"
      ? [{ t: (b.celdas || []).map((c) => String(c == null ? "" : c).replace(/\s+/g, " ").trim() || "—").join(" · "), f: F.dato, tam: est.tam }]
      : tramos.filter(Boolean).map((t) => ({
        t: t.t, f: est.fuente(t), tam: est.tam, color: est.color,
        marca: t.marca ? colorMarca(t.marca) : null, href: /^https?:/i.test(t.href || "") ? t.href : null,
      }));
    const x0 = PAG.izq + est.sangria, ancho = COL - est.sangria;
    const lineas = lineasDe(cx, runs, ancho);
    if (!lineas.length && !apuntes.length) return previo;
    const aps = apuntes.map((a) => ({ c: colorMarca(a.color), lineas: lineasDe(cx, [{ t: String(a.texto).trim(), f: F.apunte, tam: 10, saltos: true }], ancho - 10) }));
    const altoAps = aps.reduce((s, a) => s + 4 + a.lineas.length * 14, 0);

    const n = lineas.length, inter = est.inter;
    // la marca y su apunte no se parten: desde el renglón donde aparece esa marca hasta el apunte
    let desde = -1;
    if (aps.length) {
      const colores = aps.map((a) => a.c);
      desde = lineas.findIndex((l) => l.some((s) => s.run.marca && colores.indexOf(s.run.marca) >= 0));
      if (desde < 0) desde = Math.max(0, n - 1);
    }
    cx.aire(aireAntes(previo, tipo));
    const entero = n * inter + altoAps;
    if (tipo === "h") cx.lugar(n * inter + 40);                          // el intertítulo no queda solo al pie
    else if ((n <= 3 || (desde >= 0 && desde < 2)) && entero <= UTIL) cx.lugar(entero);   // corto, o con la marca arriba: entero
    else cx.lugar(Math.min(2, n || 1) * inter);                          // nunca un renglón suelto al pie
    const antes = (i) => {
      if (i === desde && desde >= 2) {
        const resto = (n - i) * inter + altoAps;
        if (resto <= UTIL) cx.lugar(resto);
      } else if (n >= 4 && i === n - 2) {
        cx.lugar(2 * inter + (desde >= 0 ? altoAps : 0));                 // ni el último renglón solo arriba
      }
    };
    const ocupado = renglones(cx, lineas, x0, est.tam, est.inter, { antes, subrayado: hex(medio.color, GRIS) });
    if (!lineas.length && aps.length) cx.lugar(altoAps);

    if (tipo === "li" && ocupado.length) {                              // viñeta o número, colgado en la sangría
      const marcador = textoSimple(cx, b.marcador || "•", F.texto) || "•";
      const o = ocupado[0], actual = cx.pag;
      cx.doc.setPage(o.pag);
      cx.letra(F.texto, est.tam, TINTA);
      const w = cx.fu[F.texto].ancho(marcador, est.tam);
      cx.doc.text(marcador, marcador === "•" ? PAG.izq + 2.5 : Math.max(PAG.izq, PAG.izq + est.sangria - 4 - w), baseDe(o.y0, est.tam, est.inter));
      cx.doc.setPage(actual);
    }
    if (tipo === "cita") raya(cx, ocupado, PAG.izq, hex(medio.color, GRIS), 3);
    for (const a of aps) {
      if (a.lineas.length * 14 + 4 <= UTIL) cx.lugar(a.lineas.length * 14 + 4);
      dibujarApunte(cx, a.lineas, a.c, x0);
    }
    return tipo;
  }

  function armarCompleta(cx, notas, anio) {
    notas.forEach((n, k) => {
      if (k > 0) cx.nueva();                                            // cada nota en página nueva
      renglones(cx, lineasDe(cx, runTitulo(n, 22), COL), PAG.izq, 22, 25);
      if (n.bajada) {
        cx.y += 6;
        renglones(cx, lineasDe(cx, [{ t: n.bajada, f: F.texto, tam: 13, color: GRIS }], COL), PAG.izq, 13, 18);
      }
      cx.y += 8;
      const minutos = !n.a_medias && n.minutos > 0 ? `${Math.round(n.minutos)} min de lectura` : "";
      etiqueta(cx, n.medio, [n.medio.nombre, n.autor, fechaNota(n.fecha, anio), minutos].filter((s) => s && String(s).trim()).join(" · "));
      cx.y += 4;
      original(cx, n.url);
      cx.y += 14;
      if (n.a_medias) { aMedias(cx, n.medio); cx.y += 16; }
      let previo = null;
      for (const b of Array.isArray(n.bloques) ? n.bloques : []) if (b) previo = bloque(cx, b, n.medio, previo);
      const perdidas = (n.perdidas || []).map((m) => prepararMarca(cx, m, 11.5, 17.3, false));
      if (perdidas.length) {
        cx.aire(24);
        const tit = lineasDe(cx, [{ t: "Marcas que ya no están en el texto", f: F.titulo, tam: 11 }], COL);
        const alto = tit.length * 14 + 6 + perdidas[0].alto;
        if (alto <= UTIL) cx.lugar(alto);
        renglones(cx, tit, PAG.izq, 11, 14);
        cx.y += 6;
        perdidas.forEach((p, i) => { if (i) cx.y += 10; dibujarMarca(cx, p); });
      }
    });
  }

  /* ---------- pie y entrada ---------- */

  function pies(cx, exportado) {
    const doc = cx.doc, total = doc.getNumberOfPages();
    const izq = textoSimple(cx, `el diario del pelado · exportado el ${exportado}`, F.dato);
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      cx.letra(F.dato, 8, GRIS);
      doc.text(izq, PAG.izq, PAG.alto - 36);
      const der = `${p} de ${total}`;
      doc.text(der, PAG.ancho - PAG.der - cx.fu[F.dato].ancho(der, 8), PAG.alto - 36);
    }
  }

  function normalizar(n) {
    const m = (n && n.medio) || {};
    return Object.assign({}, n, {
      titulo: String((n && n.titulo) || ""),
      medio: { nombre: String(m.nombre || ""), letra: String(m.letra || ""), color: hex(m.color, GRIS), tinta: hex(m.tinta, "#FFFFFF") },
      marcas: Array.isArray(n && n.marcas) ? n.marcas.filter((x) => x && String(x.texto || "").trim()) : [],
      perdidas: Array.isArray(n && n.perdidas) ? n.perdidas.filter((x) => x && String(x.texto || "").trim()) : [],
    });
  }

  function armar(modelo, modo) {
    if (!base64 || !window.jspdf || !window.jspdf.jsPDF) throw new Error("El PDF todavía no está listo: falta cargar().");
    const notas = (modelo && Array.isArray(modelo.notas) ? modelo.notas : []).map(normalizar);
    if (!notas.length) throw new Error("No hay notas para armar el PDF.");
    const completa = modo === "completa";
    const cx = nuevoDoc();
    const exp = fechaExport(modelo.exportado);
    if (completa) armarCompleta(cx, notas, exp.anio); else armarMarcas(cx, notas, exp.anio);
    pies(cx, exp.texto);
    const nombre = (n) => (textoInfo(n.titulo) ? n.titulo : n.medio?.nombre || "Sin título");
    const titulo = notas.length === 1
      ? (completa ? nombre(notas[0]) : `Marcas: ${nombre(notas[0])}`)
      : (completa ? `${notas.length} notas` : `Marcas de ${notas.length} notas`);
    cx.doc.setProperties({ title: textoInfo(titulo), creator: "el diario del pelado" });
    cx.doc.setLanguage("es-AR");
    return cx.doc.output("blob");
  }

  window.diarioPdf = { cargar, armar };
})();
