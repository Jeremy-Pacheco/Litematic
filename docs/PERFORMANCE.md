# Rendimiento

Este documento recoge las optimizaciones aplicadas y las mediciones que las justifican. Cada
funcionalidad que afecte al rendimiento añade aquí sus resultados, indicando la prueba, el
equipo y el navegador utilizados.

**Equipo de las mediciones:** AMD Ryzen 7 3700X, 48 GB de RAM, Windows 11, Node.js 24.17,
Chrome 157 (headless).

## Lectura de NBT (`feature/nbt-reader`)

### Lector propio frente a Deepslate

Medido con `pnpm test:perf` (`tests/perf/nbtReader.perf.test.ts`, Node con `--expose-gc`).
Memoria = aumento del heap de JavaScript y de los `ArrayBuffer` tras leer, con el resultado aún
en memoria. NBT ya descomprimido como entrada.

| Caso                                                     | Lector propio                      | Deepslate 0.27.2           |
| -------------------------------------------------------- | ---------------------------------- | -------------------------- |
| `ByteArray` 16 Mi elementos (`.schem` de 256×256×256)    | 1 ms, heap +0 MiB, buffers +0 MiB  | 2060 ms, heap **+702 MiB** |
| `LongArray` 2 Mi elementos (`.litematic`, 16 Mi bloques) | 7 ms, heap +0 MiB, buffers +16 MiB | 374 ms, heap **+209 MiB**  |
| `ByteArray` 64 Mi elementos (`.schem` de 512×256×512)    | < 1 ms, +0 MiB                     | no ejecutado               |

- El `ByteArray` propio es una **vista sin copia** del buffer descomprimido: no ocupa memoria
  adicional.
- El `LongArray` propio ocupa exactamente sus datos (8 bytes por elemento).
- Deepslate crea un objeto por elemento: unos 44 bytes por bloque en `ByteArray`. Por
  extrapolación, 64 Mi bloques necesitarían unos 2,8 GiB solo para ese array.

### Archivo grande en el navegador

Prueba en Chrome con un `.schem` Sponge v3 de **150 MB comprimidos / 150 MB descomprimidos**
(datos aleatorios, poco comprimibles; 800×384×512):

| Métrica                                         | Resultado        |
| ----------------------------------------------- | ---------------- |
| Tiempo de lectura dentro del worker             | ~200 ms          |
| Tiempo total visto por la interfaz              | ~390 ms          |
| Respuesta del hilo principal durante la lectura | 2–6 ms por frame |
| Tareas largas (> 50 ms) en el hilo principal    | ninguna          |

### Decisiones

- **Un worker por archivo**, destruido al terminar o cancelar: libera toda la memoria de la
  lectura sin depender del recolector de basura.
- **Mensajes de progreso limitados** a uno cada 50 ms para no saturar el hilo principal.
- **Al hilo principal no vuelve el árbol NBT**, solo el resumen y la `Structure` ya decodificada.
- **Reserva única del buffer** usando el tamaño indicado al final del gzip, para no duplicar la
  memoria al juntar los trozos descomprimidos.

## Decodificación de Litematica (`feature/litematic-parser`)

Medido con `pnpm test:perf` (`tests/perf/litematicParser.perf.test.ts`): una región con paleta
de 256 estados (8 bits por bloque) y datos aleatorios, partiendo del NBT ya leído.

| Región          | Bloques | Tiempo | Velocidad        | Memoria nueva                      |
| --------------- | ------: | -----: | ---------------- | ---------------------------------- |
| 256 × 256 × 256 |  16,8 M | 125 ms | ~134 M bloques/s | `blocks` (2 bytes/bloque), heap +0 |
| 512 × 256 × 512 |  67,1 M | 455 ms | ~147 M bloques/s | 128 MiB (2 bytes/bloque), heap +0  |

En Chrome, un `.litematic` de 512 × 256 × 512 (64 MB comprimido) se lee de principio a fin
(descompresión + NBT + decodificación) en ~570 ms dentro del worker, con la interfaz respondiendo.

### Decisiones

- **Decodificación secuencial con aritmética de 32 bits** (`PackedReader`): sin `BigInt` y sin
  multiplicaciones por bloque; la posición de bit avanza de forma incremental.
- **Un único array denso** para toda la estructura (`Uint16Array`): ningún objeto por bloque.
- **Transferencia sin copia**: el worker transfiere el `ArrayBuffer` de `blocks` al hilo
  principal en tiempo constante.
- **NBT de entidades copiado aparte** (`detachNbt`): enviarlo tal cual arrastraría una copia de
  todo el archivo descomprimido, porque los `ByteArray` son vistas sobre ese buffer.
- **Límite comprobado antes de reservar**: una estructura de más de 512 Mi posiciones se rechaza
  sin intentar reservar la memoria.

## Decodificación de Sponge (`feature/schem-parser`)

Medido con `pnpm test:perf` (`tests/perf/spongeParser.perf.test.ts`): Sponge v3 de
512 × 256 × 512 con bloques aleatorios, partiendo del NBT ya leído.

| Paleta       | Varints            | Tiempo | Velocidad        | Memoria nueva                 |
| ------------ | ------------------ | -----: | ---------------- | ----------------------------- |
| 100 estados  | 1 byte cada uno    | 358 ms | ~187 M bloques/s | 128 MiB (2 B/bloque), heap +0 |
| 1000 estados | casi todos 2 bytes | 465 ms | ~144 M bloques/s | 128 MiB (2 B/bloque), heap +0 |

En Chrome, ese mismo tamaño (56 MB comprimido, 100 estados) se lee de principio a fin en ~740 ms
vistos desde la interfaz.

- Los bloques llegan como vista sin copia del `ByteArray` (`VarintReader` no copia).
- Camino rápido para varints de un byte, que son todos los de paletas de hasta 128 estados.
- La traducción índice local → global usa una tabla (`Int32Array`), no un `Map`.

## Decodificación de MCEdit (`feature/legacy-schematic-parser`)

Medido con `pnpm test:perf` (`tests/perf/mceditParser.perf.test.ts`): 512 × 256 × 512 con IDs
(0–199) y metadatos aleatorios, partiendo del NBT ya leído.

| Bloques | Estados resultantes | Tiempo | Velocidad        | Memoria nueva                 |
| ------: | ------------------: | -----: | ---------------- | ----------------------------- |
|  67,1 M |                1337 | 581 ms | ~116 M bloques/s | 128 MiB (2 B/bloque), heap +1 |

- Cada `id:meta` distinto se traduce una sola vez; luego se usa una tabla de 65 536 enteros.
- La tabla de IDs antiguos se carga con `import()` dentro del worker y es un **fragmento aparte**
  (99,3 kB, 12,3 kB con gzip). Comprobado en el navegador con el build de producción: no se
  descarga al abrir `.litematic` o `.schem`, solo al abrir un `.schematic`.
- Para que el worker pueda separar fragmentos se genera como **módulo ES**
  (`worker.format: 'es'` en `vite.config.ts`); el formato por defecto (`iife`) metía la tabla
  dentro del worker (118 kB).

## Lista de materiales (`feature/material-list`)

- El recuento por estado (`blockCounts`) se hace en **la misma pasada** que ya contaba los bloques
  que no son aire, dentro del worker. Repetidas las mediciones de los tres parsers tras el cambio:
  mismas cifras (±3 %).
- `blockCounts` se **transfiere** al hilo principal junto con `blocks`.
- La lista se calcula en el hilo principal a partir de la paleta (decenas o cientos de entradas),
  no de los bloques: su coste no depende del tamaño de la estructura.
- La tabla de materiales tiene como mucho unos cientos de filas, así que no necesita
  virtualización.

## Recursos del juego (`feature/minecraft-assets`)

| Medición (client.jar 26.3, 40 MB)                     | Resultado                       |
| ----------------------------------------------------- | ------------------------------- |
| Extracción en Node (test con el jar real)             | 10 138 archivos, 4,5 MB, 158 ms |
| Carga completa en Chrome (leer + extraer + IndexedDB) | ~0,3–0,6 s                      |
| Tamaño en IndexedDB                                   | ~4,3 MB                         |

- Todo ocurre en un worker que se destruye al terminar: los 40 MB del jar no quedan en memoria.
- Solo se descomprimen las entradas de la lista blanca (≈ 30 % de las entradas, 4,5 MB).
- Al arrancar solo se leen de IndexedDB los metadatos y el idioma, no los 4 MB de archivos.

## Preparación de modelos (`feature/block-models`)

| Medición                                                             | Resultado                                   |
| -------------------------------------------------------------------- | ------------------------------------------- |
| Paleta de `house-69.schem` (40 estados), en Node                     | 6 ms (geometría)                            |
| Paleta de un `.litematic` real (52 estados), en Node                 | 7 ms                                        |
| Mismo `.schem` en Chrome: worker completo (IndexedDB + atlas + bake) | 20 ms; 365 ms incluyendo arrancar el worker |
| Atlas resultante                                                     | 128 × 128 px                                |

- Coste proporcional a los **estados de la paleta**, no a los bloques.
- Los arrays de geometría y el atlas se **transfieren** sin copia.
- Los 4 MB de recursos se leen de IndexedDB dentro del worker; no pasan por el hilo principal.

## Visor 3D (`feature/structure-viewer`)

Medido en Chrome con la **GPU real** (NVIDIA RTX 3070, ANGLE/D3D11), a 1440 × 900.

| Estructura                      |   Bloques | Secciones | Triángulos | Visible tras elegir el archivo |
| ------------------------------- | --------: | --------: | ---------: | -----------------------------: |
| `.schem` real (casa)            |       711 |         1 |      5 714 |                        ~0,15 s |
| `.litematic` real (torre)       |     5 383 |        29 |     64 904 |                         ~0,2 s |
| Terreno generado 256 × 96 × 256 | 2 878 516 |       779 |  2 096 038 |                    **~0,95 s** |

Terreno grande girando la cámara: **1 283 _draw calls_, 3,6–3,9 ms por frame (mediana) y 5,5–6,1 ms
(p95)**. Hubo **0 tareas largas** en el hilo principal durante la carga y 0 frames con la imagen
quieta. Al cambiar de estructura se liberan las geometrías (1 283 → 2).

Con dibujado por software (SwiftShader, sin GPU) el mismo terreno tarda ~7 s y produce tareas
largas: el coste es del rasterizado por CPU, no de la app.

Mejoras aplicadas y medidas en esta funcionalidad:

| Cambio                                              | Antes                           | Después            |
| --------------------------------------------------- | ------------------------------- | ------------------ |
| Translúcidos en una sola pasada (`forceSinglePass`) | 3 613 174 triángulos dibujados  | 2 096 038          |
| Vértices compactos y subida repartida por frames    | tareas largas de hasta 542 ms   | 0 (GPU real)       |
| Constantes del bake en un módulo sin Deepslate      | `mesher.worker.js` 235 kB       | 3 kB               |
| Visor cargado bajo demanda                          | `index.js` 675 kB (180 kB gzip) | 96 kB (35 kB gzip) |

## Capas (`feature/layer-system`)

Cambiar de capa no reconstruye geometría: oculta secciones, mueve dos planos y pide como mucho dos
tapas. En el terreno de 256 × 96 × 256 (65 536 posiciones por capa), con la GPU real, desde que
se cambia de capa hasta que se dibujan las tapas: **~190 ms la primera vez** (el worker vuelve a
la estructura tras el mallado) y **14–83 ms** después, según los bloques del nivel. Una tapa ya
guardada se muestra en el siguiente frame. El visor sigue a 4,1 ms por frame de mediana.

## Inspector de bloques (`feature/block-inspector`)

Seleccionar un bloque recorre la cuadrícula de bloques en el hilo principal: como mucho
`X + Y + Z` celdas (en el terreno de 256 × 96 × 256, menos de 610 consultas al array). No depende
del número de bloques ni de triángulos y no hace falta un worker. El árbol NBT está limitado a 8
niveles y 64 hijos por nodo, así un cofre lleno de cajas de shulker no bloquea la interfaz.

## Resource packs (`feature/texture-packs`)

- El pack se extrae en el worker de recursos y se guarda en IndexedDB; el hilo principal solo
  recibe sus metadatos.
- Al preparar los modelos solo se decodifican las texturas que usa la paleta, también las del pack.
- Pack de pruebas con 13 texturas de 1024 px en el terreno de 2,9 M bloques: modelos y atlas en
  ~1,7 s (decodificar 13 Mpx), texturas reducidas a 1/2 para caber en un atlas de 4096 px.

## Compilación

Tras `feature/structure-viewer`:

| Archivo                              |    Tamaño |      gzip | Cuándo se descarga               |
| ------------------------------------ | --------: | --------: | -------------------------------- |
| `index.js`                           |  95,73 kB |  35,18 kB | Al abrir la app                  |
| `index.css`                          |  12,47 kB |   2,87 kB | Al abrir la app                  |
| `ViewerScreen.js` (visor y Three.js) | 581,96 kB | 146,94 kB | Al empezar a leer una estructura |
| `ViewerScreen.css`                   |   9,44 kB |   2,01 kB | Con el visor                     |
| `structure.worker.js`                |  19,36 kB |         — | Al leer una estructura           |
| `models.worker.js` (Deepslate)       | 241,31 kB |         — | Al mostrar en 3D                 |
| `mesher.worker.js`                   |   3,00 kB |         — | Al mostrar en 3D                 |
| `assets.worker.js`                   |  11,23 kB |         — | Al cargar el client.jar          |
| `legacyBlocks.js`                    |  99,26 kB |   12,3 kB | Solo con `.schematic`            |

La interfaz no hace trabajo continuo: no hay bucles de animación ni temporizadores salvo el
cierre automático de las notificaciones y los mensajes de progreso durante una lectura. El visor
solo dibuja cuando cambia la cámara o la escena.
