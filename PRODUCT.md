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

Ningún texto pasa por una IA: no hay resúmenes, traducciones ni reescrituras. Cada nota es la del medio, con su título, bajada, autor, foto y cuerpo, y un enlace al original. Sin publicidad, sin funciones sociales, sin algoritmo que decida qué ver: la selección de medios es de Lucca.

## Operating Context

- Se abre desde la pantalla de inicio como una app, en vertical y horizontal; el iPad y el iPhone pesan lo mismo.
- La edición se arma sola en GitHub cada 15 a 20 minutos; la app guarda la última para leer sin conexión.
- Medios (datos/medios.json): El País, BBC Mundo, El Mundo, CNN en Español, Infobae, El Doce, La Nación, Página/12, Perfil, Todo Noticias y Le Monde Diplomatique Cono Sur.
- Inspiración de uso declarada: Flipboard (tapa, páginas que se pasan, secciones, lector limpio). No se copian sus funciones sociales ni su publicidad.

## Capabilities and Constraints

- Notas completas de 9 medios. El País queda "a medias" por decisión: título, foto, el comienzo que manda su RSS y enlace para seguir leyendo en su web (bloquea a los servidores de GitHub). Le Monde Diplomatique trae sólo el comienzo de las notas de su edición mensual (muro de pago); algunas notas web salen enteras.
- Cada nota trae: medio, título, bajada (casi siempre), autor (a veces), fecha, foto principal (casi siempre), cuerpo en HTML (párrafos, intertítulos, fotos con epígrafe, citas, listas) y enlace al original.
- Las categorías vienen de cada medio; no hay clasificación propia.
- Las notas se publican cifradas: la app pide una clave una sola vez y descifra en el dispositivo. Las notas nunca quedan legibles en público.
- Sin decidir todavía: notificación push para la edición de la mañana (opcional), cómo se agrupan las secciones (por medio, por tema o ambas).

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
