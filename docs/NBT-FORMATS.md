# Formatos NBT

> **Estado:** lectura de NBT, detección del formato y parsers de los tres formatos
> (**Litematica**, **Sponge** y **MCEdit**) implementados.

## Formatos soportados

| Formato                               | Extensión    | Detección por contenido                            | Parser de bloques                    |
| ------------------------------------- | ------------ | -------------------------------------------------- | ------------------------------------ |
| Litematica                            | `.litematic` | `Version`, `Metadata` y `Regions` en la raíz       | ✅ `feature/litematic-parser`        |
| Sponge Schematic v3                   | `.schem`     | Compuesto `Schematic` con `Version` = 3 y `Blocks` | ✅ `feature/schem-parser`            |
| Sponge Schematic v1 / v2              | `.schem`     | `Version`, `Palette` y `BlockData` en la raíz      | ✅ `feature/schem-parser`            |
| MCEdit / Schematica (anterior a 1.13) | `.schematic` | `Blocks` y `Data` (ByteArray) y `Materials`        | ✅ `feature/legacy-schematic-parser` |

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

| Campo           | Contenido                                                                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `size`          | Caja que envuelve toda la estructura                                                                                                                     |
| `palette`       | Paleta global sin duplicados (`BlockState`: `name` + `properties`). Índice 0 = aire                                                                      |
| `blocks`        | Índice de paleta por posición, orden Y-Z-X: `(y · size.z + z) · size.x + x`                                                                              |
| `nonAirBlocks`  | Posiciones que no son aire                                                                                                                               |
| `blockEntities` | Posición, `id` y NBT completo (copiado, sin referencias al archivo descomprimido)                                                                        |
| `entities`      | Posición fraccionaria, `id` y NBT                                                                                                                        |
| `regions`       | Subregiones con nombre (Litematica); el resto de formatos tiene una sola, sin nombre                                                                     |
| `metadata`      | Nombre, autor, descripción, fechas                                                                                                                       |
| `warnings`      | Problemas no fatales: índices inexistentes, nombres anteriores a 1.13, solapamientos, entidades omitidas, IDs antiguos desconocidos, estados aproximados |

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
  la 1.13**. Se leen y se marcan con un aviso. La tabla de IDs numéricos del parser MCEdit no
  sirve aquí, porque estos archivos guardan nombres de la 1.12, no números: su conversión queda
  pendiente.
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

## Sponge Schematic (`.schem`)

Referencia: especificación oficial
([SpongePowered/Schematic-Specification](https://github.com/SpongePowered/Schematic-Specification)),
versiones 1, 2 y 3. Es el formato de WorldEdit (que guarda en v3 desde la 7.3).

|                         | v1 (2016)      | v2 (2019)                                  | v3 (2021)                                |
| ----------------------- | -------------- | ------------------------------------------ | ---------------------------------------- |
| Ubicación de los campos | Raíz           | Raíz                                       | Compuesto `Schematic`                    |
| Paleta                  | `Palette`      | `Palette`                                  | `Blocks.Palette`                         |
| Bloques                 | `BlockData`    | `BlockData`                                | `Blocks.Data`                            |
| Block entities          | `TileEntities` | `BlockEntities` (datos junto a `Pos`/`Id`) | `Blocks.BlockEntities` (datos en `Data`) |
| Entidades               | —              | `Entities` (datos junto a `Pos`/`Id`)      | `Entities` (datos en `Data`)             |
| `DataVersion`           | —              | Sí                                         | Sí                                       |

- **Tamaño**: `Width`, `Height`, `Length` son _unsigned short_ guardados en shorts con signo
  (hasta 65 535 por eje).
- **Orden de bloques**: `x + z · Width + y · Width · Length`, el mismo que `Structure`; se copian
  en orden sin reordenar.
- **Bloques como varints**: cada índice ocupa de 1 a 5 bytes (7 bits por byte, el bit alto indica
  que siguen más). `VarintReader` los lee de forma secuencial, con un camino rápido para valores de
  un byte (paletas de hasta 128 estados).
- **Paleta invertida** respecto a Litematica: `{"minecraft:oak_stairs[facing=north]": 5}`. El texto
  se interpreta con `parseBlockStateString` (namespace `minecraft` por defecto). Los índices pueden
  tener huecos.
- **Posiciones** (`Pos`): relativas a la esquina (0, 0, 0) de la estructura. `Offset` solo indica
  dónde pegarla y no afecta.
- Se aceptan `BlockEntities` y `TileEntities` en cualquier versión y ubicación, porque algunas
  versiones de WorldEdit los han mezclado.
- **Metadatos**: `Name`, `Author`, `Date`. WorldEdit no suele guardar el nombre: el título es
  entonces el nombre del archivo.
- **Biomas**: no se leen todavía. Podrían servir más adelante para el color de hierba y hojas.

### Versiones antiguas

Se marca el aviso de nombres anteriores a la 1.13 cuando `DataVersion` < 1631. La v1 no tiene
`DataVersion`, así que **no se puede saber** si sus nombres son anteriores a la 1.13 y no se
marca.

### Validación

| Problema                                                          | Resultado             |
| ----------------------------------------------------------------- | --------------------- |
| Sin versión, sin tamaño, sin paleta o sin datos de bloques        | `invalid-structure`   |
| Texto de blockstate mal formado                                   | `invalid-structure`   |
| Índice de paleta negativo o mayor de 2^20                         | `invalid-structure`   |
| Menos o más varints que `Width × Height × Length`, varint cortado | `invalid-structure`   |
| Índice de bloque sin entrada en la paleta                         | Aire + aviso          |
| Block entity fuera de la estructura o sin `Pos`                   | Se omite + aviso      |
| Estructura de más de 512 Mi posiciones                            | `structure-too-large` |

### Verificación con un archivo real

Un `.schem` real de WorldEdit 7.4.6 (Sponge v3, `DataVersion` 5023, 12 × 14 × 15, 40 estados, 8
block entities, 6 entidades) da **711 bloques** que no son aire, la misma cifra que una
decodificación independiente hecha con un script aparte sobre el NBT leído por Deepslate. El
archivo no se incluye en el repositorio (`tests/fixtures/local/`).

## MCEdit / Schematica (`.schematic`)

Formato anterior a la 1.13, con **IDs numéricos**. Referencia: `MCEditSchematicReader` de
WorldEdit.

```text
raíz
├─ Width, Height, Length   short (sin signo)
├─ Materials               "Alpha" (Java Edition; "Classic" y "Pocket" se rechazan)
├─ Blocks                  ByteArray: 8 bits bajos del ID
├─ AddBlocks (opcional)    4 bits altos del ID, dos bloques por byte
├─ Add (opcional)          4 bits altos del ID, un byte por bloque (Schematica antiguo)
├─ Data                    ByteArray: metadatos (0–15)
├─ TileEntities            x, y, z relativos a la estructura
└─ Entities                Pos relativo
```

- **Orden**: `y · W · L + z · W + x`, igual que `Structure`.
- **`AddBlocks`**: en índices pares se usan los 4 bits bajos del byte `índice / 2`; en impares,
  los 4 bits altos. ID completo = `(alto << 8) | Blocks`.
- **No hay metadatos** (nombre, autor) ni `DataVersion`.

### Traducción de IDs numéricos

Cada `id:meta` se traduce a un blockstate moderno con la tabla `src/lib/data/legacyBlocks.json`:

- **Origen**: `data/pc/common/legacy.json` de
  [PrismarineJS/minecraft-data](https://github.com/PrismarineJS/minecraft-data), commit
  `11fed0c`, licencia MIT (declarada en su README; aviso completo en
  `src/lib/data/LICENSE-minecraft-data.txt`). Se descartaron las tablas de WorldEdit (GPL) y
  las de Minecraft (propiedad de Mojang).
- **1682 entradas**, todas comprobadas por un test con `parseBlockStateString`.
- Se regenera con `node scripts/update-legacy-blocks.mjs`, fijado a ese commit.
- Búsqueda: `id:meta` → si no existe, `id:0` (variante por defecto) → si tampoco, aire y aviso
  `unknownLegacyBlocks`.
- **Renombres posteriores a la 1.13** (`LEGACY_RENAMES` en `parsers/mcedit/legacyBlocks.ts`): la
  tabla da nombres de la 1.13 y los recursos actuales solo tienen los nuevos. Se mantienen las
  propiedades.

  | 1.13         | Actual              | Desde  |
  | ------------ | ------------------- | ------ |
  | `sign`       | `oak_sign`          | 1.14   |
  | `wall_sign`  | `oak_wall_sign`     | 1.14   |
  | `stone_slab` | `smooth_stone_slab` | 1.14   |
  | `grass_path` | `dirt_path`         | 1.17   |
  | `grass`      | `short_grass`       | 1.20.3 |

  `stone_slab` es un cambio de significado: en la 1.13 era la losa de piedra lisa (la de la
  1.12), y desde la 1.14 `stone_slab` es otra losa, de piedra normal. Un test comprueba con el
  `client.jar` local (26.3) que todos los bloques que da la tabla tienen blockstate.

- Cada combinación `id:meta` se resuelve **una sola vez**; después se usa una tabla de 65 536
  enteros, así que el coste por bloque es constante.
- La tabla se carga **bajo demanda** con `import()` dentro del worker: es un fragmento aparte
  (99 kB, 12,3 kB con gzip) que solo se descarga al abrir un `.schematic`.

### Estados que no estaban en `id:meta`

Antes de la 1.13 parte del aspecto de un bloque no se guardaba en `id:meta`: el juego lo
calculaba al dibujar a partir de los vecinos, o lo leía del block entity. La tabla solo puede dar
un valor por defecto, así que después de traducir los IDs el parser hace dos pasos, como el
convertidor de mundos de la 1.13:

**1. Block entities** (`parsers/mcedit/legacyBlockEntities.ts`). Se aceptan los dos estilos de
ID (`Bed` y `minecraft:bed`). Un block entity sobre un bloque que no le corresponde se ignora.

| Block entity          | Campo                                            | Resultado                                      |
| --------------------- | ------------------------------------------------ | ---------------------------------------------- |
| `Bed`                 | `color` (orden de la lana)                       | `red_bed` → `<color>_bed`                      |
| `Banner`              | `Base` (daño del tinte: 0 = negro)               | `white_banner` → `<color>_banner`              |
| `Skull`               | `SkullType` (0–5), `Rot` (0–15)                  | Tipo de cabeza; `rotation` si está en el suelo |
| `FlowerPot`           | `Item` (texto, o número antes de la 1.8), `Data` | `potted_<planta>`; vacía si no hay planta      |
| `Music` / `noteblock` | `note`                                           | `note`                                         |

Los colores de los patrones de los estandartes también eran daños de tinte; se convierten al
orden de la 1.13 (`15 − Color`) en el NBT del block entity, que es lo que lee el visor. El resto
del NBT se conserva sin convertir.

**2. Vecinos** (`parsers/mcedit/legacyNeighbors.ts`). Reglas del `updateShape` del juego, en su
forma de la 1.16+ (la de los modelos que usa el visor):

| Bloques                              | Regla                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Vallas                               | Se conectan a vallas del mismo material, a puertas de valla de lado y a bloques sólidos                |
| Paneles y barrotes                   | A paneles, barrotes, muros y bloques sólidos                                                           |
| Muros                                | Lados `none`/`low`/`tall` (alto si el bloque de encima lo cubre) y poste (`up`)                        |
| Puertas de valla                     | `in_wall` junto a muros                                                                                |
| Escaleras                            | `shape` según las escaleras de delante y de detrás (`getStairsShape`)                                  |
| Puertas                              | Cada mitad completa sus propiedades con la otra (orientación, abierta, bisagra, activada)              |
| Plantas dobles                       | La mitad superior toma el tipo de la inferior                                                          |
| Redstone                             | `none`/`side`/`up`; una línea se extiende por sus dos extremos; un punto aislado sigue siendo un punto |
| Cuerda de trampa                     | Conexiones con cuerda y ganchos orientados hacia ella                                                  |
| Enredaderas                          | `up` bajo un bloque sólido                                                                             |
| Chorus                               | Conexiones con chorus (y con piedra del End debajo)                                                    |
| Tallos de calabaza y sandía (edad 7) | `attached_*_stem` hacia el fruto                                                                       |
| Hierba, podzol, micelio              | `snowy` bajo nieve                                                                                     |
| Cofres                               | Dos cofres iguales con la misma orientación forman uno doble (`left`/`right`)                          |
| Bloques musicales                    | `instrument` según el bloque de debajo                                                                 |

- "Sólido" se decide por nombre con listas explícitas (bloques completos menos losas, escaleras,
  plantas, cristales en paneles, etc.). No se usan los modelos: el parser no depende del
  `client.jar`.
- Lo que hay fuera de la estructura se considera aire, como hace WorldEdit.
- La estructura se recorre de arriba abajo: el muro de encima ya está calculado cuando se mira.
- Los estados por defecto que dejan de usarse se quitan de la paleta.
- El aviso `approximateLegacyStates` solo aparece si hay calaveras o estandartes sin block entity.

### Limitaciones

- **Instrumentos**: el juego los decidía por el material del bloque de debajo; aquí se deducen
  del nombre (madera, piedra, arena, cristal, lana…), que cubre los bloques de la 1.12 pero puede
  fallar en casos raros.
- **"Sólido"** también se decide por nombre. Casos límite (pistones extendidos, la parte trasera
  de una escalera) no conectan aunque en el juego sí lo hagan.
- **IDs de mods** (`SchematicaMapping`) no están en la tabla: se leen como aire con aviso.
- **Renombres en `.litematic` y `.schem` de la 1.13**: esos archivos guardan los mismos nombres
  antiguos (`sign`, `grass`…), pero los renombres solo se aplican a la tabla de `.schematic`.
- **Renombres futuros**: si Minecraft vuelve a renombrar un bloque, hay que añadirlo a
  `LEGACY_RENAMES`. El test con el `client.jar` local lo detecta.
- La tabla traduce IDs **numéricos**. Los `.litematic` y Sponge v1 anteriores a la 1.13 guardan
  **nombres de la 1.12** (`minecraft:stone[variant=granite]`), que esta tabla no cubre; siguen
  mostrando el aviso `legacyBlockNames`.

### Verificación

No se ha dispuesto de un `.schematic` real. Se ha probado con archivos generados según el lector
de WorldEdit (IDs de más de 255 con `AddBlocks` y `Add`, metadatos, block entities, entidades) y,
en el navegador, con una casa de 7 × 5 × 7 (suelo, paredes, tejado, cristal, puerta, valla,
escaleras y cofre): 173 bloques y 9 estados, como se esperaba.

Los estados de vecinos y de block entities se probaron con tests por regla y con un `.schematic`
generado con todos los casos (24 × 5 × 12), cuyos 46 estados resultantes se pasaron por los
modelos reales del `client.jar` 26.3: ninguno queda sin modelo y la geometría cambia como debe
(un muro con los valores de la tabla, `east=false`…, no tiene ninguna cara en los modelos
actuales; corregido tiene 10–16; una valla pasa de 6 caras, solo el poste, a 26). No se comprobó
a ojo en el navegador.

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
