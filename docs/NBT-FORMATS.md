# Formatos NBT

> **Estado:** la lectura de NBT y la detección del formato están implementadas. La
> interpretación de los bloques de cada formato (parsers) está **pendiente**.

## Formatos soportados

| Formato                               | Extensión    | Detección por contenido                            | Parser de bloques                    |
| ------------------------------------- | ------------ | -------------------------------------------------- | ------------------------------------ |
| Litematica                            | `.litematic` | `Version`, `Metadata` y `Regions` en la raíz       | ⏳ `feature/litematic-parser`        |
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

## Flujo de lectura

```text
Blob ─► detectCompression (primeros bytes) ─► gzip / zlib / sin comprimir / rechazo
     ─► DecompressionStream (streaming, límite 1 GiB) ─► Uint8Array
     ─► readNbt ─► NbtDocument
     ─► detectFormat ─► StructureFileInfo
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
| Compound                        | `Map<string, NbtValue>`                                      |

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
