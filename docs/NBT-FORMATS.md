# Formatos NBT

> **Estado:** lectura de NBT, detección del formato y **parser de Litematica** implementados.
> Los parsers de Sponge (`.schem`) y MCEdit (`.schematic`) están **pendientes**.

## Formatos soportados

| Formato                               | Extensión    | Detección por contenido                            | Parser de bloques                    |
| ------------------------------------- | ------------ | -------------------------------------------------- | ------------------------------------ |
| Litematica                            | `.litematic` | `Version`, `Metadata` y `Regions` en la raíz       | ✅ `feature/litematic-parser`        |
| Sponge Schematic v3                   | `.schem`     | Compuesto `Schematic` con `Version` = 3 y `Blocks` | ⏳ `feature/schem-parser`            |
| Sponge Schematic v1 / v2              | `.schem`     | `Version`, `Palette` y `BlockData` en la raíz      | ⏳ `feature/schem-parser`            |
| MCEdit / Schematica (anterior a 1.13) | `.schematic` | `Blocks` y `Data` (ByteArray) y `Materials`        | ⏳ `feature/legacy-schematic-parser` |

La extensión del archivo **no se usa para decidir**: solo sirve para filtrar el selector de
archivos y para avisar si no coincide con el contenido.

Datos que ya se extraen sin interpretar los bloques:

| Dato                 | Litematica                       | Sponge                      | MCEdit                      |
| -------------------- | -------------------------------- | --------------------------- | --------------------------- |
| Versión del formato  | `Version`                        | `Version`                   | —                           |
| Versión de Minecraft | `MinecraftDataVersion`           | `DataVersion` (no en v1)    | —                           |
| Dimensiones          | `Metadata.EnclosingSize` (x,y,z) | `Width`, `Height`, `Length` | `Width`, `Height`, `Length` |

- Sponge y MCEdit guardan las dimensiones como **short sin signo** (hasta 65 535); se leen así.
- Litematica puede usar tamaños negativos en las regiones; para el tamaño total se usa el valor
  absoluto.

## Modelo común: `Structure`

Todos los parsers producen el mismo tipo (`types/structure.ts`):

| Campo           | Contenido                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| `size`          | Caja que envuelve toda la estructura                                                                     |
| `palette`       | Paleta global sin duplicados (`BlockState`: `name` + `properties`). Índice 0 = aire                      |
| `blocks`        | Índice de paleta por posición, orden Y-Z-X: `(y · size.z + z) · size.x + x`                              |
| `nonAirBlocks`  | Posiciones que no son aire                                                                               |
| `blockEntities` | Posición, `id` y NBT completo (copiado, sin referencias al archivo descomprimido)                        |
| `entities`      | Posición fraccionaria, `id` y NBT                                                                        |
| `regions`       | Subregiones con nombre (Litematica); el resto de formatos tendrá una sola                                |
| `metadata`      | Nombre, autor, descripción, fechas                                                                       |
| `warnings`      | Problemas no fatales: índices inexistentes, nombres anteriores a 1.13, solapamientos, entidades omitidas |

- `blocks` es un `Uint16Array` (2 bytes por bloque) salvo que la paleta supere 65 536 estados.
- `minecraft:cave_air` y `minecraft:void_air` se tratan como aire (índice 0).
- Las propiedades se crean con `Object.fromEntries`: una clave `__proto__` es un dato más.
- Los nombres de bloque se guardan **tal como están en el archivo**. Los cambios de nombre entre
  versiones (`grass` → `short_grass`…) se resolverán donde importan: al buscar modelos y
  texturas.
- **Límite de tamaño:** 512 Mi posiciones (1 GiB de `blocks`). Se comprueba **antes** de
  reservar memoria (`structure-too-large`).
- El worker **transfiere** `blocks` al hilo principal (sin copia). El resto es pequeño.

## Litematica (`.litematic`)

Referencia: `LitematicaSchematic`, `LitematicaBlockStateContainer` y `LitematicaBitArray` del
código fuente de Litematica (fork mantenido de sakura-ryoko, rama 26.3).

```text
raíz
├─ Version / SubVersion / MinecraftDataVersion
├─ Metadata      Name, Author, Description, EnclosingSize, TotalBlocks, TimeCreated…
└─ Regions
   └─ <nombre>   Position, Size, BlockStatePalette, BlockStates,
                 TileEntities, Entities, PendingBlockTicks, PendingFluidTicks
```

### Empaquetado de bloques

- Bits por bloque: `max(2, ceil(log2(tamaño de la paleta)))`.
- Las entradas van seguidas desde el bit menos significativo del `long` 0. **Una entrada puede
  quedar repartida entre dos `long`** (a diferencia del formato de chunks de Minecraft desde 1.16,
  que deja huecos). Número de `long`: `ceil(volumen · bits / 64)`.
- Orden de las entradas en la región: `(y · tamX · tamZ) + z · tamX + x`.
- `PackedReader` decodifica con aritmética de 32 bits: vista la lista de `long` como palabras de
  32 bits desde el extremo menos significativo, la palabra `k` es `words[k ^ 1]`.

### Regiones

- `Size` puede ser **negativo** en cualquier eje: la región se extiende hacia coordenadas
  negativas desde `Position`, y su esquina mínima es `Position + Size + 1` en ese eje.
- Todas las regiones se colocan en una caja común que empieza en (0, 0, 0). El tamaño se calcula a
  partir de las regiones, no de `EnclosingSize`.
- Si dos regiones ponen bloques distintos en la misma posición, gana la última leída y se avisa.
  El aire de una región no borra los bloques de otra.
- `TileEntities` (`x`, `y`, `z`) y `Entities` (`Pos`) son relativos a la esquina mínima de su
  región.

### Versiones

| Versión | Diferencias                                                         | Soporte                                   |
| ------- | ------------------------------------------------------------------- | ----------------------------------------- |
| 1       | Otro formato de TileEntities y Entities                             | Bloques sí; entidades se omiten con aviso |
| 2–4     | Formato actual de entidades; ticks pendientes de bloques desde la 3 | Sí                                        |
| 5–7     | Ticks de fluidos; versión actual 7 (`SubVersion` 1)                 | Sí                                        |

- Archivos con versión < 5 o `MinecraftDataVersion` < 1631 usan **nombres de bloque anteriores a
  la 1.13**. Se leen y se marcan con un aviso; la conversión llegará con la tabla de
  `feature/legacy-schematic-parser`.
- Los ticks pendientes no se usan (no afectan a lo que se construye).

### Validación

| Problema                                              | Resultado             |
| ----------------------------------------------------- | --------------------- |
| Sin versión, sin regiones, región sin posición/tamaño | `invalid-structure`   |
| `BlockStates` con menos `long` de los necesarios      | `invalid-structure`   |
| Entrada de paleta sin `Name`                          | `invalid-structure`   |
| Índice de bloque fuera de la paleta                   | Aire + aviso          |
| Entidad sin posición válida                           | Se omite + aviso      |
| Estructura de más de 512 Mi posiciones                | `structure-too-large` |

### Verificación con un archivo real

Un `.litematic` real (versión 7, `MinecraftDataVersion` 4325, región con `Size` negativo en Z,
paleta de 52 estados → 6 bits) da exactamente los **5383 bloques** que Litematica guardó en
`Metadata.TotalBlocks`. El archivo no se incluye en el repositorio: el test
(`tests/parsers/litematic/realFile.test.ts`) lo busca en `tests/fixtures/local/`, carpeta ignorada
por git, y se salta si no está.

## Flujo de lectura

```text
Blob ─► detectCompression (primeros bytes) ─► gzip / zlib / sin comprimir / rechazo
     ─► DecompressionStream (streaming, límite 1 GiB) ─► Uint8Array
     ─► readNbt ─► NbtDocument
     ─► detectFormat ─► StructureFileInfo
     ─► parser del formato (si existe) ─► Structure
```

### Compresión

- Se identifica por los **bytes iniciales**: gzip (`1F 8B`), zlib (cabecera deflate válida) o
  NBT sin comprimir (empieza por `0A`, un compuesto). Cualquier otra cosa: `unrecognized-data`.
- Se descomprime con `DecompressionStream`, nativo del navegador (sin dependencias). El archivo
  comprimido se lee por trozos y nunca se guarda entero en memoria.
- En gzip, los últimos 4 bytes indican el tamaño descomprimido. Se usa **solo como pista** para
  reservar la memoria una vez; el tamaño real se comprueba siempre.

### Lector NBT propio

`parsers/nbt/NbtReader.ts` lee NBT Java (big-endian). Representación en memoria
(`types/nbt.ts`):

| Tag NBT                         | En memoria                                                   |
| ------------------------------- | ------------------------------------------------------------ |
| Byte, Short, Int, Float, Double | `number`                                                     |
| Long                            | `bigint`                                                     |
| String                          | `string` (UTF-8 modificado de Java)                          |
| ByteArray                       | `Int8Array` **sin copia**: vista sobre el buffer leído       |
| IntArray                        | `Int32Array`                                                 |
| LongArray                       | `NbtLongArray`: pares de palabras de 32 bits (`Uint32Array`) |
| List                            | `NbtList` (tipo de elemento + `items`)                       |

`NbtList` y `NbtLongArray` son **objetos simples** con un campo `kind`, no clases: al enviarlos
entre el worker y la página (`postMessage`) el navegador conserva `Map`, typed arrays y objetos
simples, pero pierde los prototipos de las clases. `detachNbt` hace una copia propia de un
fragmento antes de enviarlo, para no arrastrar el buffer completo del archivo.
| Compound | `Map<string, NbtValue>` |

- **`LongArray` en palabras de 32 bits**: los bloques de `.litematic` están empaquetados en
  `long`s con un número variable de bits por bloque. Desempaquetarlos con aritmética de 32 bits
  es mucho más rápido que con `BigInt`.
- **`Map` para los compuestos**: claves como `__proto__` son datos, sin riesgo de
  contaminación de prototipos.
- El modelo es **de lectura**: no conserva el tipo exacto de los números (byte frente a int).
  Para escribir NBT se usará Deepslate.

### Validación y seguridad

| Riesgo                                    | Medida                                                                      |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| ZIP bomb                                  | Se corta la descompresión al superar 1 GiB (`too-large`)                    |
| Longitudes falsas (p. ej. 2 000 millones) | Se comprueba que caben en los bytes restantes **antes** de reservar memoria |
| Anidamiento extremo                       | Profundidad máxima 512, igual que Minecraft                                 |
| Datos truncados o tipos desconocidos      | `invalid-nbt`, nunca un fallo sin control                                   |
| Cadenas mal formadas                      | Los bytes inválidos se sustituyen por U+FFFD                                |
| Memoria insuficiente                      | Los fallos de reserva se traducen a `out-of-memory`                         |

### Errores

| Código                | Cuándo                                                   |
| --------------------- | -------------------------------------------------------- |
| `unrecognized-data`   | No es gzip, zlib ni NBT                                  |
| `corrupt-compression` | Los datos comprimidos están dañados o truncados          |
| `too-large`           | Supera 1 GiB descomprimido                               |
| `invalid-nbt`         | NBT truncado, longitudes imposibles, tipos desconocidos… |
| `unknown-format`      | NBT válido que no es Litematica, Sponge ni MCEdit        |
| `out-of-memory`       | El navegador no pudo reservar memoria                    |
| `cancelled`           | El usuario canceló la lectura                            |
| `read-failed`         | Cualquier otro error inesperado (se muestra el detalle)  |

## Deepslate

Se ha estudiado [Deepslate](https://github.com/misode/deepslate) 0.27.x (MIT):

- **Lee y escribe NBT** (`NbtFile.read` / `NbtFile.write`), SNBT y JSON.
- **No soporta `.litematic` ni `.schem`.** Su clase `Structure` es para el formato `.nbt` de
  estructuras de Minecraft y guarda un objeto por bloque.
- **Crea un objeto por elemento** en `ByteArray` y `LongArray`. Medido en
  [PERFORMANCE.md](PERFORMANCE.md): 702 MiB para 16 Mi bloques de un `.schem`, frente a 0 MiB
  del lector propio.
- Descomprime todo de golpe con `pako`, sin límite de tamaño, sin progreso y sin cancelación.

Por eso la **lectura** usa el lector propio y Deepslate queda para la **escritura** de NBT y,
más adelante, para sus utilidades de blockstates y modelos. Los tests usan Deepslate para
generar NBT y comprobar que el lector propio lee exactamente lo mismo.

Versión instalada: **0.27.2** (la 0.27.3 era demasiado reciente al instalarla).

## Limitaciones conocidas

- Se necesitan dos copias del contenido descomprimido solo si la pista de tamaño de gzip es
  incorrecta (archivos con varios miembros gzip); en el caso normal hay una sola.
- No se admiten datos basura después del final del gzip: `DecompressionStream` los rechaza
  como `corrupt-compression`.
- NBT de Bedrock (little-endian) no está soportado; estos formatos son de Java Edition.
