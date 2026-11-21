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
- **Al hilo principal solo vuelve un resumen** (`StructureFileInfo`), no el árbol NBT.
- **Reserva única del buffer** usando el tamaño indicado al final del gzip, para no duplicar la
  memoria al juntar los trozos descomprimidos.

## Compilación

Tras `feature/nbt-reader`:

| Archivo               |   Tamaño |     gzip |
| --------------------- | -------: | -------: |
| `index.js`            | 70,79 kB | 27,02 kB |
| `index.css`           | 10,27 kB |  2,47 kB |
| `structure.worker.js` |  8,00 kB |        — |

Deepslate no se incluye en el build: por ahora solo lo usan los tests.

La interfaz no hace trabajo continuo: no hay bucles de animación ni temporizadores salvo el
cierre automático de las notificaciones y los mensajes de progreso durante una lectura.
