# Sistema de texturas

> **Estado:** la **carga de los recursos de Minecraft** y la **preparación de modelos y atlas** están
> implementadas (ver [RENDERING.md](RENDERING.md)), igual que los **resource packs** del usuario.

## Licencia de los recursos

Las texturas, modelos y textos de Minecraft son propiedad de Mojang y **no se incluyen en el
repositorio ni en la aplicación**. Se leen del `client.jar` que el propio usuario selecciona, en su
navegador, y nunca se suben a ningún servidor.

## Recursos del juego (`feature/minecraft-assets`)

### Origen

El usuario selecciona el `client.jar` de su instalación:

| Sistema | Ruta (launcher oficial)                                        |
| ------- | -------------------------------------------------------------- |
| Windows | `%APPDATA%\.minecraft\versions\<versión>\<versión>.jar`        |
| macOS   | `~/Library/Application Support/minecraft/versions/<v>/<v>.jar` |
| Linux   | `~/.minecraft/versions/<versión>/<versión>.jar`                |

Versión de referencia: **26.3** (última estable al implementarlo; `world_version` 5023, formato de
recursos 97, jar de unos 40 MB).

### Qué se extrae

De las ~34 000 entradas del jar (casi todas código), solo:

| Ruta                                                                     | Para qué                                  |
| ------------------------------------------------------------------------ | ----------------------------------------- |
| `version.json`                                                           | Versión, DataVersion, formato de recursos |
| `assets/minecraft/blockstates/*.json`                                    | Qué modelo usa cada estado de bloque      |
| `assets/minecraft/models/{block,item}/**.json`                           | Modelos                                   |
| `assets/minecraft/items/*.json`                                          | Modelos de ítem (1.21.4+)                 |
| `assets/minecraft/textures/{block,item,entity,colormap}/**.{png,mcmeta}` | Texturas, animaciones, colores de bioma   |
| `assets/minecraft/lang/en_us.json`                                       | Nombres oficiales                         |

Con el jar 26.3: **10 138 archivos, 4,5 MB**.

**Idiomas:** el jar solo incluye `en_us.json`. El resto de idiomas los descarga el launcher aparte
(`.minecraft/assets/objects`, con nombres en forma de hash), así que los nombres oficiales se
muestran en inglés.

### Seguridad de la extracción (`assets/zipReader.ts`)

| Riesgo              | Medida                                                                                                                                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zip Slip            | Se rechaza el archivo entero si **cualquier** entrada tiene `..`, `.`, segmentos vacíos, ruta absoluta, letra de unidad, `\` o caracteres de control. (En el navegador no se escribe en disco, pero las rutas se usan como claves.) |
| Archivos no pedidos | Lista blanca de rutas y extensiones; lo demás no se descomprime                                                                                                                                                                     |
| ZIP bomb            | Antes de descomprimir: tamaño declarado ≤ 16 MB por archivo, proporción ≤ 100:1, total ≤ 256 MB, ≤ 100 000 entradas                                                                                                                 |
| Tamaños falsos      | `fflate` descomprime en un buffer del tamaño declarado y **recorta** si el real es mayor; por eso se verifica el **CRC-32** de cada archivo contra el del directorio central                                                        |
| Datos dañados       | El CRC-32 también detecta cualquier alteración (`corrupt-zip`)                                                                                                                                                                      |
| Jar equivocado      | Sin `version.json`, block states o idioma → `not-client-jar` (p. ej. el jar del servidor)                                                                                                                                           |

Biblioteca: [`fflate`](https://github.com/101arrowz/fflate) 0.8.3 (MIT, sin dependencias).

### Caché (`assets/assetCache.ts`)

IndexedDB, base `litematicviewer`, almacén `assets`, tres registros:

| Clave           | Contenido                       | Se lee                                  |
| --------------- | ------------------------------- | --------------------------------------- |
| `vanilla:meta`  | Versión, nº de archivos, tamaño | Al arrancar                             |
| `vanilla:lang`  | `en_us` (solo textos)           | Al arrancar                             |
| `vanilla:files` | Todos los archivos extraídos    | Solo cuando los necesite el renderizado |

Si IndexedDB no está disponible (modo privado, almacenamiento bloqueado), la app sigue funcionando
sin recursos. El usuario puede quitarlos desde el diálogo.

### Flujo

```text
Diálogo «Recursos de Minecraft» ─► AssetManager.importJar(file)
   └─► [worker] loadClientJar: leer ─► readClientJar (zipReader + validación) ─► saveAssets (IndexedDB)
   ◄── { meta, lang }  →  store `assets`  →  nombres oficiales en la lista de materiales
Arranque ─► assets.init() ─► loadAssetsSummary() (meta + lang)
```

### Uso actual

- **Nombres oficiales** en la lista de materiales: `block.minecraft.<id>` o `item.minecraft.<id>`.
- **Aviso** si una estructura tiene una DataVersion mayor que la de los recursos cargados.

## Atlas y modelos (`feature/block-models`)

- El atlas se construye en un worker con `OffscreenCanvas` (el de Deepslate necesita `document`), solo con las texturas que usa la paleta de la estructura.
- Empaquetado en estantes en un cuadrado potencia de dos, hasta 4096 px. Si las texturas no caben
  (packs de alta resolución), se reducen a 1/2, 1/4… hasta 1/16 y el visor lo avisa.
- Texturas animadas: primer fotograma. Texturas ausentes: casilla magenta y negra de Minecraft.
- La capa de cada textura (opaca, recortada, translúcida) se deduce de su canal alfa.
- UV normalizadas con v hacia abajo: el visor subirá el atlas sin invertirlo.

Detalles en [RENDERING.md](RENDERING.md).

## Resource packs (`feature/texture-packs`)

El usuario puede importar **un** resource pack `.zip` desde el diálogo de recursos (indicador
de la barra superior) o **soltándolo sobre la ventana**; un `.jar` soltado se carga como recursos
del juego (`import/openAssetFiles.ts` decide por la extensión y los lectores comprueban el
contenido). Se aplica **sobre** los recursos de su `client.jar`: lo que el pack no
tiene se toma del juego, así que hacen falta los recursos cargados.

### Qué se lee (`assets/resourcePack.ts`)

- `pack.mcmeta` (obligatorio): descripción (texto o componente de texto, sin códigos `§`),
  `pack_format` y los formatos admitidos en todas sus formas (`supported_formats` como número,
  `[min, max]` u objeto; `min_format`/`max_format` de 1.21.9+, con `[major, minor]`).
- `pack.png` (icono, opcional).
- `assets/<namespace>/blockstates/*.json`, `models/**.json` y `textures/**.{png,mcmeta}`. El
  resto (sonidos, idiomas, shaders, fuentes…) no se extrae.
- Packs comprimidos junto con su carpeta (`MiPack/pack.mcmeta`): se detecta esa carpeta raíz.
- **Overlays** (1.20.2+): se aplican, en el orden del pack, los que admiten el formato de los
  recursos cargados. Los nombres de carpeta se validan (`[a-z0-9_.-]`).

El resultado son archivos con las mismas rutas que el `client.jar`. El worker de modelos los
superpone a los del juego antes de preparar los modelos y el atlas.

### Compatibilidad

Se compara el rango de formatos del pack con el formato de los recursos cargados. Un pack de otra
versión **se carga igualmente** con un aviso, porque muchas texturas siguen coincidiendo. No se
incluye una tabla de formatos → versiones, para no inventar correspondencias.

### Seguridad

- Mismo lector ZIP que el `client.jar`: rutas validadas (sin `..`, absolutas ni barras
  invertidas) y límites de entradas, tamaño por archivo, tamaño total y ratio de compresión.
- Antes de decodificar una textura se lee la cabecera PNG: si no es un PNG o mide más de
  4096 px de ancho o 16 Mpx en total, se ignora (se usa la del juego) y se informa en el diálogo.
  Así una imagen enorme no puede agotar la memoria al construir el atlas.
- El contenido se trata solo como datos: JSON parseado, imágenes decodificadas por el navegador.
  Nada del pack se ejecuta ni se inserta como HTML.

### Caché y cambio de pack

- Se guarda en IndexedDB (`pack:meta` con el icono, `pack:files`). Sigue en uso tras recargar
  la página hasta que el usuario lo quita.
- Un pack nuevo sustituye al anterior. Si la importación falla, el anterior sigue en uso.
- Al cambiar o quitar el pack, el visor rehace modelos, atlas y geometría (unos 0,6 s en el
  terreno de pruebas), pero **no** vuelve a leer la estructura.

### Limitaciones

- Un solo pack a la vez (sin pila de varios packs).
- No se admiten formatos ajenos al juego: texturas conectadas de OptiFine (CTM), modelos
  emisivos, etc.
- Las animaciones muestran su primer fotograma, como las del juego.

## Pendiente

- Colores del bioma real y texto de los carteles colgantes.
