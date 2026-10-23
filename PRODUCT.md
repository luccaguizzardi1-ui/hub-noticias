# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

HTML, CSS y JavaScript sin frameworks ni paso de compilación (elegido por Lucca). Web app instalable (PWA) en iPhone y iPad desde Safari ("Agregar a pantalla de inicio"), alojada en GitHub Pages. El motor que arma la edición es Python y corre en GitHub Actions (`motor/`).

## Users

Un solo lector: Lucca, que lo usa para sí mismo todos los días, en iPhone y en iPad por igual y a cualquier hora (lectura rápida y lectura larga). No hay otros usuarios, cuentas ni perfiles.

## Product Purpose

"el diario del pelado": un diario personal al estilo de Flipboard que junta en un solo lugar las notas de los medios que Lucca eligió, con el texto completo tal como lo publicó cada medio, y se actualiza solo. Éxito: abrirlo y encontrar la edición del momento lista para leer de punta a punta, sin tener que entrar a once sitios llenos de publicidad.

## Positioning

Ningún texto pasa por una IA: no hay resúmenes, traducciones ni reescrituras. La única tarea de la IA (Gemini) es elegir la sección de cada nota nueva mirando su título y su bajada; nunca ve ni toca el cuerpo. Cada nota es la del medio, con su título, bajada, autor, foto y cuerpo, y un enlace al original. Sin publicidad, sin funciones sociales, sin algoritmo que decida qué ver: la selección de medios es de Lucca.

## Operating Context

- Se abre desde la pantalla de inicio como una app, en vertical y horizontal; el iPad y el iPhone pesan lo mismo.
- La edición se arma sola en GitHub cada 15 a 20 minutos; la app guarda la última para leer sin conexión.
- Medios (datos/medios.json), 27 en tres grupos. De acá: Cadena 3, cba24n, Clarín, El Alfil, El Doce, La Nueva Mañana, La Voz, Filo News, Infobae, La Nación, La Política Online, Le Monde Diplomatique Cono Sur, Letra P, Página/12, Perfil y Todo Noticias. De afuera: BBC Mundo, CNN en Español, El Mundo, El Orden Mundial, El País, Infobae América, Le Grand Continent y The New York Times en Español. Economía y tecnología: Bloomberg Línea, Hipertextual y Xataka.
- Inspiración de uso declarada: Flipboard (tapa, páginas que se pasan, secciones, lector limpio). No se copian sus funciones sociales ni su publicidad.

## Capabilities and Constraints

- Notas completas de casi todos los medios. El País y el New York Times en Español quedan "a medias" (el NYT bloquea las notas): título, foto, el comienzo que manda su RSS y enlace para seguir leyendo en su web (bloquea a los servidores de GitHub). Le Monde Diplomatique trae sólo el comienzo de las notas de su edición mensual (muro de pago); algunas notas web salen enteras.
- Cada nota trae: medio, título, bajada (casi siempre), autor (a veces), fecha, foto principal (casi siempre), cuerpo en HTML (párrafos, intertítulos, fotos con epígrafe, citas, listas) y enlace al original.
- La edición se lee por secciones, en este orden: Política argentina, Política internacional (la política de afuera de la Argentina, la política argentina contada por medios de otro país y la geopolítica de todo el mundo), Economía, Sociedad y policiales, IA y tecnología, Deportes, Cultura y espectáculos y Otras. La tapa es un tramo propio: la principal del momento y lo más destacado de cada sección. Destacado = el hecho que más medios cuentan a la vez, más lo arriba que esté en Google News Argentina (titulares y temas: sólo como señal; nunca se muestran sus notas ni sus medios, y si Google no contesta la tapa se ordena sin él) (Gemini agrupa las notas del mismo hecho mirando títulos y bajadas, con un control de palabras en común), con desempate por lo más reciente; de cada hecho se muestra la mejor versión (completa, con foto, de hoy; en política argentina, de un medio de acá). En el lector, «También la cuentan» lleva a las versiones de otros medios. Gemini elige la sección de lo nuevo; si falla, la deciden reglas a partir de la sección que declara el medio.
- La lista de medios (por nombre, no por insignia) deja leer uno solo.
- Guardadas, para más tarde (sin notificación: un aviso al abrir después de la hora elegida) y anotaciones:
  - en el lector, tocar una frase la propone y un color la marca;
  - cada marca tiene color (amarillo, verde, celeste o rosa) y un apunte escrito «al lado»: debajo del párrafo en el teléfono, al margen en el iPad;
  - se borra con el tacho y se puede deshacer.
- Anotaciones junta las marcas y exporta en PDF el título y las marcas, o la nota completa con las marcas.
- Elegir permite eliminar guardadas, quitar de más tarde o borrar marcas en lote, siempre con «Deshacer».
- Avisos de último momento (Web Push):
  - cuando un hecho grande lo cuentan muchos medios a la vez y Gemini confirma que es de peso (catástrofe, muerte de una personalidad, hecho político grave);
  - como mucho 4 por día; de noche, sólo lo enorme;
  - se activan en cada equipo y el código se pega como secreto de GitHub.
- Muro de pago: lo que el medio declara sólo para suscriptores queda a medias (el comienzo y el enlace), en todos los medios. Todo queda en cada equipo; no se sincroniza entre el iPhone y el iPad.
- Lo que es del sitio y no de la nota se saca entero, sin tocar el texto: «Mirá también», relacionadas, carteles de newsletter o notificaciones («Seguir leyendo», «Suscribite a…»), la ficha de BBC y, desde el cartel del muro, el resto. El crédito de una foto («Fuente de la imagen, AFP») pasa a ser su epígrafe.
- Las notas se publican cifradas: la app pide una clave una sola vez y descifra en el dispositivo. Las notas nunca quedan legibles en público.
- Sin decidir todavía: notificación push para la edición de la mañana (opcional).

## Brand Commitments

- Nombre: "el diario del pelado", siempre en minúsculas, como en el logo.
- Logo de Lucca (marca/logo-original.webp, con fondo transparente): un pelado caricaturesco con anteojos negros junto a un diario con un bloque rojo, y el nombre en una grotesca negra muy gruesa en minúsculas con borde crema de calcomanía. Colores propios del logo: negro, rojo #EE271F, piel #FAD4B8 y crema #F9EFE7. Para fondos oscuros existe la versión troquelada marca/logo-calco.png (contorno crema alrededor de todo). El logo no se redibuja ni se recolorea.
- Las notas siempre muestran el medio que las publicó; cuando una nota está a medias, se dice y se ofrece el original.
- Pedido explícito de Lucca: algo limpio y bonito que no se parezca a "la típica web hecha con Claude".

## Evidence on Hand

- Notas reales que extrae el motor: `motor/prueba.py` genera `informes/prueba-extraccion.json` y `.html` (con los cuerpos completos; quedan locales, no se suben).
- No hay logos de los medios en el proyecto todavía. No hay contenido inventado ni testimonios: todo lo que se muestre tiene que salir de notas reales.

## Product Principles

1. El texto del medio es sagrado: se muestra completo y sin tocar, con su crédito, o se avisa que está a medias.
2. La edición se lee como un diario, no como un feed: tiene principio, jerarquía y final.
3. Abrir y leer: nada entre Lucca y la nota (ni registro, ni avisos, ni pasos de más).
4. Funciona sin conexión con la última edición.
5. iPhone y iPad son igual de importantes; ninguno es la versión achicada del otro.
