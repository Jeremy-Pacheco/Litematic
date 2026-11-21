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

## Compilación

Tras `feature/litematic-parser`:

| Archivo               |   Tamaño |     gzip |
| --------------------- | -------: | -------: |
| `index.js`            | 75,33 kB | 28,35 kB |
| `index.css`           | 11,09 kB |  2,58 kB |
| `structure.worker.js` | 13,55 kB |        — |

Deepslate no se incluye en el build: por ahora solo lo usan los tests.

La interfaz no hace trabajo continuo: no hay bucles de animación ni temporizadores salvo el
cierre automático de las notificaciones y los mensajes de progreso durante una lectura.
