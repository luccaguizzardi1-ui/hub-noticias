---
name: el diario del pelado
description: La edición como red de subte. Cada medio es una línea con su letra y su color, y se lee pasando la hoja.
colors:
  cartel: "#16181D"
  cartel-texto: "#FFFFFF"
  cartel-suave: "#B4B7BF"
  anden: "#F7F7F4"
  tinta: "#16181D"
  tinta-suave: "#50535B"
  junta: "#DCDCD6"
  papel-lector: "#FBFBF9"
  anden-noche: "#121418"
  tinta-noche: "#ECEBE6"
  tinta-suave-noche: "#A3A6AD"
  junta-noche: "#2A2D33"
  papel-lector-noche: "#15171B"
  error-sobre-cartel: "#FF9C8F"
  linea-e-elpais: "#A0522D"
  linea-b-bbcmundo: "#00857C"
  linea-m-elmundo: "#E4007C"
  linea-c-cnnespanol: "#F15A22"
  linea-i-infobae: "#F7A800"
  linea-d-eldoce: "#00A651"
  linea-n-lanacion: "#0072BC"
  linea-12-pagina12: "#E2231A"
  linea-p-perfil: "#7B3F98"
  linea-t-tn: "#00A6E0"
  linea-l-eldiplo: "#8DC63F"
typography:
  display:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(34px, 9vw, 64px)"
    fontWeight: 780
    lineHeight: 0.96
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 84"
  headline:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(28px, 6.6vw, 44px)"
    fontWeight: 740
    lineHeight: 1.04
    letterSpacing: "-0.018em"
    fontVariation: "'wdth' 90"
  title:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "25px"
    fontWeight: 720
    lineHeight: 1.06
    letterSpacing: "-0.015em"
    fontVariation: "'wdth' 90"
  cartel-hora:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "30px"
    fontWeight: 760
    lineHeight: 1
    letterSpacing: "-0.01em"
    fontFeature: "'tnum'"
    fontVariation: "'wdth' 86"
  body:
    fontFamily: "Alegreya, Georgia, serif"
    fontSize: "20px"
    fontWeight: 400
    lineHeight: 1.6
  bajada:
    fontFamily: "Alegreya, Georgia, serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.3
    fontFeature: "'tnum'"
  insignia:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.46em"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 90"
rounded:
  none: "0px"
  riel: "2px"
  circulo: "50%"
spacing:
  junta: "1px"
  friso: "10px"
  margen-telefono: "18px"
  margen-tableta: "22px"
  margen-apertura: "24px"
  margen-cartel: "28px"
  margen-apertura-tableta: "56px"
components:
  insignia:
    backgroundColor: "{colors.linea-n-lanacion}"
    textColor: "{colors.cartel-texto}"
    rounded: "{rounded.circulo}"
    typography: "{typography.insignia}"
    size: "26px"
  selector-medio:
    textColor: "{colors.cartel-texto}"
    rounded: "0px"
    padding: "7px 8px 7px 12px"
    height: "38px"
  insignia-pie:
    rounded: "{rounded.circulo}"
    size: "22px"
  insignia-placa-apertura:
    backgroundColor: "{colors.cartel-texto}"
    textColor: "{colors.linea-n-lanacion}"
    rounded: "{rounded.circulo}"
    size: "64px"
  friso:
    backgroundColor: "{colors.linea-n-lanacion}"
    height: "10px"
    rounded: "{rounded.none}"
  cartel:
    backgroundColor: "{colors.cartel}"
    textColor: "{colors.cartel-texto}"
    padding: "14px 18px"
  pieza:
    backgroundColor: "{colors.anden}"
    textColor: "{colors.tinta}"
    typography: "{typography.title}"
    rounded: "{rounded.none}"
    padding: "14px 18px 16px"
  apertura:
    backgroundColor: "{colors.linea-n-lanacion}"
    textColor: "{colors.cartel-texto}"
    typography: "{typography.display}"
    padding: "28px 24px 24px"
  recorrido:
    backgroundColor: "{colors.anden}"
    textColor: "{colors.tinta-suave}"
    typography: "{typography.label}"
    padding: "12px 18px 10px"
  lector-barra:
    backgroundColor: "{colors.cartel}"
    textColor: "{colors.cartel-texto}"
    padding: "10px 12px 10px 18px"
  lector-proxima:
    backgroundColor: "{colors.linea-n-lanacion}"
    textColor: "{colors.cartel-texto}"
    padding: "18px 20px"
    rounded: "{rounded.none}"
  boton-cartel:
    backgroundColor: "{colors.cartel-texto}"
    textColor: "{colors.cartel}"
    padding: "15px 22px"
    rounded: "{rounded.none}"
  campo-clave:
    backgroundColor: "{colors.cartel-texto}"
    textColor: "{colors.cartel}"
    padding: "14px 16px"
    rounded: "{rounded.none}"
  aviso-nueva:
    backgroundColor: "{colors.cartel}"
    textColor: "{colors.cartel-texto}"
    padding: "12px 18px 12px 14px"
    rounded: "{rounded.none}"
---

# Design System: el diario del pelado

## Overview

**Creative North Star: "Andén"**

La edición es una red de subte porteño. El marco (el cartel de estación, las insignias de línea, los frisos de pared, las aperturas de cuaderno y el recorrido al pie) habla en la señalética del subte: chapa esmaltada casi negra con letras blancas, azulejo blanco frío, círculos de color con una letra. Adentro de ese marco, la columna de lectura es calma: papel claro, serif humanista, nada que compita con el texto del medio.

La densidad es de diario de papel, no de feed. Cada pantalla es una hoja entera: en el teléfono, una, dos o tres notas apiladas; en la tableta, una grilla recompuesta con la principal grande. Las fotos van a sangre, sin esquinas ni sombras de tarjeta, y las piezas se separan con la junta de 1 px entre azulejos. Se pasa la hoja con el dedo y la hoja se dobla por la mitad (hacia arriba en el teléfono, al costado en la tableta) mientras el recorrido avanza una estación.

El color es estructural y está racionado: los 11 colores de línea sólo aparecen como marcas de señalética (insignia, friso, riel, apertura a pantalla completa, botón de próxima nota). El resto del sistema es chapa, azulejo y tinta.

**Key Characteristics:**
- Chapa oscura para el marco, azulejo blanco frío para las hojas, papel apenas más cálido para leer.
- Once líneas, cada una con letra, color y tinta propia, tomadas de `datos/medios.json`.
- Archivo (ancho variable, angosta) para el marco; Alegreya para la lectura. Ambas autoalojadas.
- Esquinas rectas en todo; el círculo queda reservado para insignias y estaciones.
- Estados como marcas: estación llena = leída, hueca = pendiente, partida = a medias.
- El logo entra como calcomanía troquelada, levemente girada, pegada sobre el cartel.

## Colors

Una paleta de señalética: dos materiales neutros (chapa y azulejo) y once colores de línea que sólo existen como marcas.

### Primary
- **Chapa esmaltada** (cartel): el fondo del cartel de la tapa, la barra del lector, la pantalla de clave, el fin de la línea y el aviso de edición nueva. También es el color del `body` y del `theme-color` del manifiesto, para que la barra de estado del iPhone se funda con el cartel. No cambia en modo oscuro.
- **Letra de chapa** (cartel-texto): texto sobre la chapa; también el fondo de los botones y del campo de clave sobre la chapa (chapa invertida).
- **Letra de chapa apagada** (cartel-suave): datos secundarios sobre la chapa (día, cantidad de notas, hora en la barra del lector, el texto del fin). 8.8:1 sobre la chapa.

### Secondary: las once líneas
Cada medio es una línea. Los valores viven en `datos/medios.json` (`linea.letra`, `linea.color`, `linea.tinta`) y llegan al CSS como `--c` / `--t` en cada pieza, apertura e insignia, y como `--linea` / `--linea-tinta` en el recorrido y el lector.

| Letra | Medio | Token | Tinta |
|---|---|---|---|
| E | El País | linea-e-elpais | blanca |
| B | BBC Mundo | linea-b-bbcmundo | blanca |
| M | El Mundo | linea-m-elmundo | blanca |
| C | CNN en Español | linea-c-cnnespanol | chapa |
| I | Infobae | linea-i-infobae | chapa |
| D | El Doce | linea-d-eldoce | chapa |
| N | La Nación | linea-n-lanacion | blanca |
| 12 | Página/12 | linea-12-pagina12 | blanca |
| P | Perfil | linea-p-perfil | blanca |
| T | Todo Noticias | linea-t-tn | chapa |
| L | Le Monde Diplomatique Cono Sur | linea-l-eldiplo | chapa |

Cada par color/tinta pasa 4.5:1 (el más justo es BBC Mundo, 4.52:1).

- **Combinación**: un degradé de bandas duras, una por línea en el orden de la edición, cada una de 100/11 % del ancho (`--combinacion`, armado en `montar()`). Es el color de la portada: el friso de techo de sus hojas, el riel del recorrido en la portada, el riel del fin de la línea y la marca del aviso de edición nueva.

### Neutral
- **Azulejo blanco frío** (anden): el fondo de todas las hojas, las piezas y el recorrido.
- **Tinta** (tinta): títulos y texto sobre el azulejo; mismo valor que la chapa.
- **Tinta gastada** (tinta-suave): bajadas, pie de pieza, leyenda del recorrido, firma y epígrafes. 7.2:1 sobre el azulejo.
- **Junta** (junta): la línea de 1 px entre piezas, el fondo de la grilla de tableta (que asoma como junta), el fondo de las fotos mientras cargan, las reglas de las tablas.
- **Papel de lectura** (papel-lector): el fondo del lector, un punto más cálido que el azulejo.
- **Error sobre chapa** (error-sobre-cartel): sólo el mensaje de clave incorrecta.

### Modo oscuro
Se activa por `prefers-color-scheme: dark` (o `data-theme="dark"`). Sólo cambian los cinco neutros de lectura: anden-noche, tinta-noche, tinta-suave-noche, junta-noche, papel-lector-noche. La chapa, las líneas, sus tintas y las aperturas quedan igual: el subte no cambia de color de noche.

### Named Rules
**The Línea Sólo Señaliza Rule.** Un color de línea aparece sólo como superficie de señalética (insignia, friso, riel, apertura, botón de próxima nota, subrayado y comilla del lector, selección). Nunca como color de texto sobre el azulejo: Infobae y Le Monde Diplomatique no llegan a 2:1 contra el azulejo.

**The Tinta de la Línea Rule.** Lo que va sobre un color de línea usa la tinta que esa línea declara en `medios.json` (blanca o chapa). No se decide pantalla por pantalla.

**The Combinación Rule.** La portada no tiene color propio: es la estación de combinación y lleva las once bandas. Ningún color de línea solo representa a la edición entera.

## Typography

**Marco:** Archivo (con Helvetica Neue, Arial), variable 100–900 y ancho 62–125 %, autoalojada en `app/fuentes/` (latin y latin-ext).
**Lectura:** Alegreya (con Georgia), variable 400–900, normal e itálica, autoalojada.

**Character:** Archivo, angostada entre 82 y 92 % de ancho y en pesos 720–800, hace de letra de cartel; Alegreya, en cuerpo generoso, lleva el texto de los medios. Las dos son de Buenos Aires.

### Hierarchy
- **Display** (780, clamp(34px, 9vw, 64px), 0.96, ancho 84 %): el nombre del medio en su apertura. En tableta, clamp(48px, 6vw, 92px). Variante del fin de la línea: clamp(40px, 11vw, 80px), ancho 82 %, 0.94.
- **Headline** (740, clamp(28px, 6.6vw, 44px), 1.04): el título de la nota en el lector.
- **Title** (720, 25px de base, 1.06, ancho 90 %, `text-wrap: balance`): el título de cada pieza. El tamaño sale del largo del título (ver regla).
- **Hora del cartel** (760, 30px, 1, cifras tabulares): «Edición de las HH:MM». La pantalla de clave usa el mismo registro (30px, 760).
- **Bajada** (Alegreya 400, 17px, 1.4): en las piezas; en el lector, clamp(19px, 4.6vw, 23px), 1.38. Siempre en tinta gastada.
- **Body** (Alegreya 400, 20px, 1.6, columna de 680px máx.): el cuerpo de la nota. Intertítulos en Archivo 720, 22px. Citas en Alegreya itálica 22px con una comilla de Archivo 800 de 54px en el color de la línea.
- **Label** (Archivo 600, 13px, cifras tabulares): el pie de pieza (insignia · medio · hora · minutos), la leyenda del recorrido (12.5px), la firma y los epígrafes (13.5px).
- **Insignia** (Archivo 800, 46 % del diámetro, ancho 90 %): la letra de la línea.

### Named Rules
**The Título Entero Rule.** Los títulos son del medio y no se cortan nunca. El tamaño se elige por largo: corto (hasta 60 caracteres) 30px, medio (hasta 100) 25px, largo 21px; la principal sube a 38 / 31 / 26px en el teléfono y a 46 / 38 / 32px en la tableta; la pieza chica baja a 19px. Si en una apertura no entran todos, las últimas se resumen en «y N notas más en las próximas hojas». Las bajadas sí pueden recortarse a 4 líneas o esconderse.

**The Marco y Lectura Rule.** Todo lo que es señal (cartel, insignias, títulos, etiquetas, botones) va en Archivo; todo lo que es texto del medio para leer (bajadas, cuerpo, citas) va en Alegreya.

**The Cifras de Andén Rule.** Horas, minutos y conteos llevan cifras tabulares, como un tablero de horarios.

## Layout

La app es un libro de hojas a pantalla completa (`position: fixed; inset: 0`), una sola a la vista; no hay scroll de página. Sólo el lector scrollea.

**Teléfono vs. tableta.** Se decide por tamaño, no por dispositivo: tableta si el ancho es de 700px o más y el alto de 600px o más; orientación horizontal si el ancho es mayor o igual al alto. Las dos versiones se arman con plantillas propias; ninguna es la otra achicada.

**Plantillas de teléfono.** Tapa (cartel + friso + principal con foto de al menos 200px), y luego un patrón que rota: *dos* (dos notas a partes iguales, foto de al menos 140px y sin bajada: manda la foto), *una* (principal a hoja completa), *tres* (una normal con foto y dos chicas sin foto ni bajada). Acostado, *dos* y *tres* se ponen en fila, la principal pone la foto al 52 % a la izquierda y la tapa pasa a dos columnas (cartel 38 %, nota).

**Plantillas de tableta.** El cartel se vuelve franja (calcomanía, datos e insignias de 38px a la derecha). Grillas con junta de 1px: *mosaico* (1.7fr / 1fr, la principal ocupa dos filas), *trío* (tres columnas, con bajada de hasta 4 líneas), *cuatro* (2 × 2), *vertical* (principal arriba a todo el ancho, dos abajo, filas 1.5fr / 1fr), *una* y *par*. Parada, mosaico y trío se recomponen como vertical. La última hoja de una sección toma la plantilla con exactamente esa cantidad de lugares: nunca queda un hueco.

**Frisos y zona segura.** La tapa lleva el cartel y debajo un friso de 10px del color de la nota principal. Las hojas interiores llevan un friso de techo de `safe-area-inset-top + 10px`: ocupa la franja de la hora y la isla del iPhone con el color de la línea (o la combinación en la portada), para que nada se esconda debajo. Todo lo fijo suma `env(safe-area-inset-*)`.

**Recorrido.** Fijo al pie; las hojas reservan `safe-area-inset-bottom + 62px`. Se esconde hacia abajo sobre las aperturas y el fin (pantallas de color o chapa).

**Ritmo.** Márgenes laterales de 18px en el teléfono, 22px en las piezas de tableta, 24px en las aperturas, 28px en el cartel de tableta, la clave y el fin, 56px en la apertura de tableta. La lectura usa una columna de 680px con 20px de margen; en el teléfono la foto principal y las figuras sangran esos 20px.

## Elevation & Depth

Plano por defecto. Las piezas, las fotos, las grillas y las aperturas no tienen sombra: la separación es la junta de 1px y el cambio de material (chapa contra azulejo). La profundidad aparece sólo en tres lugares, y cada uno es físico.

### Shadow Vocabulary
- **Sombra del pliegue** (velo negro, opacidad hasta 0.38 sobre la mitad que gira y 0.32 sobre la hoja que se descubre): sólo durante el pase de hoja, crece y decrece con el ángulo.
- **Calcomanía pegada** (`filter: drop-shadow(0 2px 3px rgb(0 0 0 / 0.35))`, giro de -2°): el logo troquelado sobre la chapa, en el cartel y en la clave.
- **Cartel que baja** (`box-shadow: 0 8px 24px -8px rgb(0 0 0 / 0.5)`): el aviso de edición nueva, el único elemento que flota sobre la hoja.

### Named Rules
**The Andén Plano Rule.** Ninguna pieza de lectura lleva sombra ni elevación. Si algo flota, es porque físicamente baja sobre la hoja (el aviso) o porque la hoja se está doblando.

## Shapes

Esquinas rectas en todo: fotos, piezas, botones, campo de clave, aviso, aperturas (radio 0). El círculo es la única curva y está reservado a la señalética: insignias, estaciones del recorrido y de las aperturas, y el área de 44px de los botones de la barra del lector. Los rieles (4px en el recorrido, 5px en las aperturas) tienen la punta apenas redondeada (2–3px). Las fotos se recortan con `object-fit: cover` a sangre.

**The Círculo Es Señal Rule.** Un círculo significa línea o estación. No se usa como forma decorativa ni para avatares o chips.

## Components

### Insignia de línea
El círculo del subte con la letra del medio. Fondo = color de la línea, letra = su tinta. Diámetros: 22px en el pie de pieza y en la barra del lector, siempre junto al nombre del medio; 64px invertida (fondo tinta, letra color) en la placa de la apertura cuando se lee un solo medio. Nunca aparece sola para identificar un medio: la letra no es su logo.

### Cartel de estación
La cabecera de la tapa, en chapa: calcomanía del logo (116px de alto en el teléfono, 104px en tableta, girada -2°), «Edición de las HH:MM», día y «N notas de M medios» en letra apagada, y debajo el selector de medio: un botón con borde blanco al 38 %, «Todos los medios» o «Sólo Medio» y una flechita que gira al abrir.

### Lista de medios
Un desplegable en chapa que cuelga del selector (400px como máximo, 8px por debajo), con sombra suave y una entrada de 260ms. Arriba «Todos los medios»; después los nombres en Archivo 600 17px, en orden alfabético y en tres grupos con rótulo apagado de 13px (De acá, De afuera, Economía y tecnología), cada uno con su cantidad de notas a la derecha y una tilde en el elegido. Se abre también desde el chip del filtro y desde el índice.

### Pieza (nota en una hoja)
Foto arriba a sangre (crece con el espacio que deja la hoja), texto abajo: título, bajada en Alegreya, pie fijo con insignia · medio · hora · minutos y «· a medias» cuando corresponde. Toda la pieza es un botón que abre el lector; el foco se dibuja 4px hacia adentro. Variantes: *principal* (título más grande, bajada hasta 4 líneas), *normal*, *chica* (sin foto ni bajada, 19px). Si la foto falla, la pieza queda sin foto.

### Apertura de cuaderno
La pantalla entera del color de la línea, con su tinta. Placa con la insignia de 64px invertida, el nombre del medio en display y un resumen en 15px / 550 («N notas · la última, HH:MM»). Debajo, las notas como estaciones sobre un riel vertical de 5px en la tinta: círculo de 17px con borde de 4px, lleno si se leyó, hueco si no, partido si se leyó a medias. Los títulos van enteros; los que no entran se resumen en una estación chica «y N notas más». En tableta, encabezado al 38 % y estaciones al costado.

### Recorrido
La línea al pie: riel de 4px en el color de la sección (combinación en la portada), una estación de 14px por hoja con las mismas marcas (llena / hueca / partida) y la actual agrandada a 1.45 con un aro de azulejo. Leyenda: «**Sección** · estación N de M» y, al final de la sección, «Próxima: Sección»; si en el teléfono no entra en un renglón, queda «**Sección**» y una flecha con la próxima. En la tapa, «Pasá la hoja».

### Pliegue
La interacción firma. La hoja se parte por la mitad y la mitad que gira sigue al dedo (eje X en teléfono, eje Y en tableta) hasta 180°, con el dorso mostrando la hoja de destino y la sombra del pliegue. Suelto a medias, vuelve; al soltar o pasar con velocidad, completa en 560ms con salida cúbica. En los extremos de la edición, la hoja rebota 18px en 380ms. Con movimiento reducido, la hoja cambia sin pliegue.

### Lector
Sube desde abajo en 420ms sobre el papel de lectura. Barra pegada arriba en chapa: insignia, medio y hora/minutos en letra apagada, y dos botones circulares de 44px (abrir el original, cerrar) con íconos de trazo 2.2. Artículo de 680px: título, bajada, firma, foto principal 3:2, aviso de «Nota a medias» en un recuadro de azulejo con junta, cuerpo. Los enlaces se subrayan con 2px del color de la línea. Al cierre: «Ver la nota en Medio» (o «Seguir leyendo en Medio» si está a medias) y la próxima nota del cuaderno como un bloque del color de la línea con su título entero y una flecha, sin rótulo encima.

### Tapa ampliada
Tramo propio en el recorrido («Tapa · estación N de M»).
- Primera hoja: el cartel y la principal grande, con «También la cuentan Medio y Medio» en letra apagada de 13px bajo el pie. En la tableta suma dos destacadas en mosaico.
- Hojas siguientes («resumen»): una fila por sección con la foto al costado (38 %) y el título del medio.
  - El pie tiene la sección en negrita en su propio renglón y debajo «Medio · hora · y N medios más». La sección nunca va arriba del título.
  - Cantidad por hoja: 4 en el teléfono parado, 2 lado a lado acostado, y en la tableta una grilla de 2 columnas con foto arriba (parada) o al costado (acostada).
- En el lector, antes de la próxima nota, «También la cuentan»: una lista con el medio en apagado y el título de cada versión.

### Lápiz y anotaciones
En la barra del lector, el lápiz enciende el marcador: el botón queda en un círculo blanco y aparece al pie una tira de chapa («Tocá una frase para marcarla y una marca para desmarcarla.» + «Listo»). Un toque marca la frase entera, de punto a punto; tocar una marca la desmarca. Sin el lápiz, al elegir un pedazo del texto aparece «Marcar» y al tocar una marca, «Desmarcar». La marca es el color de la línea al 28 %. Tus notas tienen tres pestañas: Guardadas, Más tarde y Anotaciones; en Anotaciones cada marca abre la nota centrada en ella, con un destello breve, y se desmarca con una cruz o con «Desmarcar todo».

### Botón sobre chapa
Chapa invertida: fondo blanco, letra chapa, Archivo 700 16px, 15px × 22px, esquinas rectas. Es «Volver a la tapa» en el fin y «Abrir la edición» en la clave (al 60 % mientras trabaja).

### Pantalla de clave
La primera vez que se abre la app instalada. Chapa a pantalla completa, calcomanía de hasta 240px, título «Clave de la edición» en 30px / 760, una línea de explicación en letra apagada, campo blanco de esquinas rectas en Archivo 600 20px, botón de chapa invertida y el error en coral.

### Fin de la línea
Hoja en chapa con el riel de combinación de 10px arriba, «Fin de la línea.» en display angosto y un texto que dice la verdad: «Leíste toda la edición.» sólo si se leyó todo; si no, «Llegaste al final de la edición.»; siempre seguido de «La próxima se arma sola en unos minutos.»

### Aviso de edición nueva
Un cartel de chapa que baja desde arriba (420ms) centrado bajo la zona segura: una marca de combinación de 26 × 8px, «Edición de las HH:MM» y «· Actualizar» en letra apagada. Nunca cambia la hoja sola: se actualiza sólo si se toca.

## Do's and Don'ts

### Do:
- **Do** tomar letra, color y tinta de cada línea de `datos/medios.json`; un medio nuevo es una línea nueva con su par color/tinta de al menos 4.5:1.
- **Do** usar la combinación de once bandas para todo lo que represente a la edición entera (portada, fin, aviso de edición nueva).
- **Do** marcar el estado de lectura con forma (llena, hueca, partida), nunca con un color nuevo.
- **Do** elegir el tamaño del título por su largo y resumir lo que no entra con «y N notas más»; los títulos se muestran enteros.
- **Do** sumar `env(safe-area-inset-*)` a todo lo fijo y cubrir la franja de la hora con el friso de techo.
- **Do** componer la tableta con sus propias plantillas, no estirar las del teléfono.
- **Do** usar la calcomanía (`logo-calco`) sobre la chapa, girada -2° y con su sombra corta; el logo no se redibuja ni se recolorea.

### Don't:
- **Don't** usar un color de línea como color de texto sobre el azulejo ni como fondo de una superficie que no sea señal.
- **Don't** redondear esquinas de fotos, piezas, botones o campos; el círculo es sólo para insignias y estaciones.
- **Don't** poner sombras de tarjeta, bordes con sombra ni elevación a las piezas.
- **Don't** cortar un título con puntos suspensivos ni con un clamp de líneas.
- **Don't** poner rótulos o etiquetas sobre los títulos (la próxima nota del lector va sin rótulo; el pie de pieza es la única etiqueta).
- **Don't** cambiar la chapa, las líneas o las aperturas en modo oscuro; sólo cambian los neutros de lectura.
