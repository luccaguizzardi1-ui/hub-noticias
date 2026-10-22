# Superficie: la app de el diario del pelado (tapa, páginas, cuadernos y lector)

Modo: Read. Lector único (Lucca), iPhone y iPad por igual, a cualquier hora. Tarea: abrir y leer la edición del momento de punta a punta, nota completa, sin pasos de más. Fotos grandes; nada recargado; nada de app genérica.

## Direction contract

THESIS: La edición es una red de subte. Cada medio es una línea con su letra y su color, la tapa es la estación de combinación y se lee bajando estación por estación, pasando la hoja. Rechaza la grilla de tarjetas con miniaturas que usa toda app de noticias.

OWN-WORLD: Cartel de chapa esmaltada casi negra (#16181D) con letras blancas, y andén blanco frío (#F7F7F4). Los 11 colores de línea viven sólo en las insignias circulares con letra, en frisos de 10 px y en las aperturas de cada cuaderno, teñidas a pantalla completa. Estado de cada nota por marca: estación llena = leída, hueca = pendiente, partida = a medias. Archivo (Omnibus-Type, Buenos Aires) para el marco y Alegreya (Huerta Tipográfica, Buenos Aires) para leer. Fotos a sangre, sin esquinas redondeadas ni sombras de tarjeta. El logo va como calcomanía troquelada pegada sobre el cartel.

STORY: Lucca abre y en un vistazo sabe de qué hora es la edición, qué medios trae y cuál es la nota principal. Pasa hojas como en Flipboard; cada medio es un cuaderno con su propia apertura; toca una nota y la lee entera; vuelve a la estación donde se bajó.

FIRST VIEWPORT: iPhone 390×844: arriba, el cartel oscuro (~190 px) con el logo-calcomanía, la hora de la edición y la fila de 11 insignias; debajo, el friso del color del medio de la nota principal; la foto principal a todo el ancho (~300 px); la etiqueta (insignia · medio · hora · minutos); el título en Archivo (~30 px) y la bajada en Alegreya; al pie, la línea de recorrido con la estación actual. iPad: el cartel se vuelve franja horizontal y la hoja recompone la principal grande con dos o tres notas más.

FORM: Señalética del subte porteño, candidata 5 de 7 de la lista propia. seed:f934272bb05ca848. Interacción firma: la hoja que se dobla siguiendo el dedo (hacia arriba en iPhone, al costado en iPad) mientras la línea de recorrido avanza una estación.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Aportes de las alternativas descartadas
- Césped y cápsulas: cada cuaderno abre con la pantalla entera del color de su línea.
- Taller Bauhaus: iPhone e iPad recomponen la hoja; ninguno es la versión achicada del otro.
- Patchera: número de estación por nota y regreso a la estación donde te bajaste.
- Pared de cajas: la misma etiqueta fija en todas las piezas (insignia, medio, hora, minutos).
- Columna en tensión: estados como marcas, no como colores.

## Decisiones abiertas
- Agrupar por tema queda afuera: portada mixta + un cuaderno por medio (elegido por Lucca).
- Notificación de la edición de la mañana: sin decidir.
