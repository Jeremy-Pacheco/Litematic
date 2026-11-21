# Renderizado

> **Estado:** la preparación de modelos, el **visor 3D**, el **sistema de capas** y el
> **inspector de bloques** están implementados.

## Preparación de modelos («bake»)

Antes de dibujar, cada **estado de la paleta** de la estructura se convierte una sola vez en
geometría lista para usar. Una estructura tiene decenas o cientos de estados aunque tenga millones
de bloques, así que este paso no depende del tamaño de la estructura.

```text
[models worker]  archivos del juego (IndexedDB, cargados en feature/minecraft-assets)
   ├─ collectTextureIds   recorre la paleta con un atlas «grabador» → texturas usadas
   ├─ buildAtlas          atlas propio (OffscreenCanvas) + capa de cada textura
   └─ bakePalette         por estado: quads por capa y por lado, cobertura de los lados
        ▲ Deepslate: BlockDefinition (variants/multipart, rotaciones, uvlock),
          BlockModel (herencia, elementos, rotaciones), BlockColors (tintes),
          SpecialRenderers (cofres, carteles, camas, estandartes, cabezas,
          cajas de shulker, campanas, macetas decoradas, fluidos, waterlogged)
   ──► BakedModels (arrays transferidos sin copia)  ──► visor (feature/structure-viewer)
```

API: `ModelManager.bake(palette)` → `BakedModels`.

### Resultado por estado (`BakedState`)

| Campo           | Contenido                                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `geometry`      | Modelo del bloque, **sin el fluido**. `geometry[capa][grupo]`: posiciones (0–1), UV, color de tinte y normales por vértice, 4 vértices por quad |
| `opaqueFaces`   | Bit por lado: el lado del modelo está **totalmente cubierto por caras opacas**                                                                  |
| `fullFaces`     | Bit por lado: el lado del modelo está totalmente cubierto (cualquier capa)                                                                      |
| `missing`       | El bloque no tiene modelo: se dibuja con la textura de «falta textura»                                                                          |
| `empty`         | Nada que dibujar (aire)                                                                                                                         |
| `fluid`         | Fluido que ocupa la posición: ninguno, agua (agua, bloques anegados, algas, praderas, burbujas) o lava                                          |
| `fluidGeometry` | Geometría de ese fluido, con la superficie por debajo del borde (o `null`)                                                                      |
| `fluidFull`     | El mismo fluido a altura completa, para cuando encima hay el mismo fluido (o `null`)                                                            |

**Grupos:** 0–5 = caras que están sobre el lado `up, down, north, south, east, west` del bloque; 6 =
caras interiores, que nunca se ocultan. Una cara pertenece a un lado si todos sus vértices están en
ese plano del bloque.

**Cobertura de un lado:** unión de las caras de ese lado sobre una rejilla de 16 × 16 (la resolución
de los modelos). Hace falta la unión: la parte trasera de una escalera son dos caras (losa +
escalón).

### Cómo usará esto el visor (eliminación de caras ocultas)

Una cara del grupo `lado` se omite si el vecino en esa dirección tiene el lado opuesto en
`opaqueFaces`. Ocultar caras detrás de una cara opaca que cubre todo el lado es siempre correcto,
aunque el modelo no declare `cullface`. Para bloques transparentes iguales (cristal junto a
cristal), se usará `fullFaces`.

### Capas de dibujo

| Capa          | Ejemplos                        | Cómo se dibujará     |
| ------------- | ------------------------------- | -------------------- |
| `Opaque`      | piedra, tablones                | normal               |
| `Cutout`      | hojas, cristal, puertas, flores | con prueba de alfa   |
| `Translucent` | cristal tintado, hielo, agua    | con mezcla, al final |

Minecraft no guarda la capa en los recursos, así que se deduce del **canal alfa de cada textura**
(`classifyAlpha`). La capa se decide **por cara**, no por bloque: una escalera inundada
(`waterlogged`) tiene caras opacas y agua translúcida. El agua se guarda aparte del modelo
(`fluidGeometry`), para que el mesher la una con el agua vecina sin tocar las caras del bloque.

### Bloques especiales

Los bloques que Minecraft dibuja como entidades no tienen modelo JSON y se generan con los
`SpecialRenderers` de Deepslate: cofres, estandartes, cabezas, cajas de shulker, campanas,
macetas decoradas y fluidos. Si el juego ya trae modelo JSON del bloque (en 26.x, carteles y
camas), se usa ese modelo y no el de Deepslate, que pediría texturas de rutas antiguas. Los fluidos
se generan siempre aparte (`fluidMeshOf`): Deepslate recibe el bloque sin `waterlogged`, para que su
agua no se dibuje dos veces.

### Giros por eje de 26.x (`models/elementRotation.ts`)

Desde 26.x un elemento de modelo puede girarse con un ángulo por eje
(`"rotation": {"x": 180, "y": -67.5, "z": -180, …}`) además de la forma clásica `axis` + `angle`,
que es la única que lee Deepslate. Al leer cada modelo (`GameResources`), esos giros se aplican en
orden X, Y, Z y, si equivalen a un giro alrededor de un solo eje, se reescriben en la forma
clásica. En el jar 26.3 solo lo usa `template_hanging_sign_rot_3` (colgantes sin enganchar con
`rotation` 3, 7, 11 y 15), cuyo giro se reduce a uno en Y. Un giro que no se reduzca a un eje se
deja tal cual y el bloque se dibuja como «falta modelo», como antes.

### Texto de los carteles (`viewer/signText.ts`, `viewer/signTextMeshes.ts`)

El texto se lee del block entity en todos sus formatos (`front_text`/`back_text` de 1.20+, con
mensajes JSON o componentes NBT de 1.21.5+; `Text1`…`Text4` anteriores; dentro de `Data` en
Sponge v3), sin caracteres de control y con 90 caracteres por línea como mucho. Cada cara con
texto es una casilla de 256 × 128 px en páginas de 2048 px (128 por página, como mucho 4 páginas):
una malla y una textura por página, recortadas por los mismos planos de las capas.

El texto se coloca delante de la tabla **del modelo que se dibujó**, porque los dos no coinciden:

| Modelo                                             | Tablas                                    | Giro                                          |
| -------------------------------------------------- | ----------------------------------------- | --------------------------------------------- |
| Del juego (JSON, 26.x)                             | Las de sus modelos; el frente mira al sur | Horario desde el sur (`rotation`, `facing`)   |
| De Deepslate (archivos del juego sin esos modelos) | Las de sus `SpecialRenderers`, a 2/3      | Antihorario desde el norte, como lo aplica él |

`BakedState.specialModel` dice cuál se usó en cada estado de la paleta. Valen los carteles de pie,
de pared, colgantes y colgantes de pared (block entity `minecraft:hanging_sign`). La tabla de un
colgante es más cuadrada (14 × 10) que la casilla (2 : 1), así que el texto se ensancha al dibujarlo
para que la letra no salga estirada. Un test comprueba con el jar real y con Deepslate que, en
todas las rotaciones, el texto de cada lado queda pegado a su cara de la tabla y derecho.

Color de tinte del juego, oscurecido salvo con texto brillante (que lleva contorno). Limitación: la
letra es la del sistema, no la del juego.

### Estandartes con dibujos (`models/blockEntityRender.ts`)

Los dibujos de un estandarte están en su block entity, no en su estado, y el bake es por estado.
Por eso cada combinación distinta de estado y dibujos recibe una **entrada extra de paleta solo
para dibujar**, y esas posiciones se cambian en una copia del array de bloques que recibe el
mesher. El array, la paleta y los recuentos de la estructura no cambian: materiales, inspector y
selección siguen igual. Se leen los dos formatos: `patterns` (1.20.5+, id o definición en línea
con `asset_id`) y `Patterns` (anterior, códigos como `bs` y colores numéricos), también dentro
de `Data` en Sponge v3. Los ids se validan (segmentos `[a-z0-9_]`, sin puntos) y se admiten como
mucho 16 capas por estandarte.

### Bloques o texturas que faltan

Un bloque sin modelo (más nuevo que los recursos cargados, o de un mod) se dibuja como un cubo con
la textura de «falta textura» de Minecraft (cuadros magenta y negros) y se lista en
`missingBlocks`. Nunca se inventa una textura.

## Visor 3D (`feature/structure-viewer`)

```text
estructura leída ─► App cambia al visor (ViewerScreen, cargado bajo demanda con Three.js)
   └─ StructureViewer ─► SceneManager (renderizador, escena, dibujado bajo demanda)
                       └─ StructureManager.show(structure)
                            1. ModelManager.bake(paleta)        [models worker]
                            2. atlas → DataTexture, 3 materiales
                            3. Mesher por secciones 32 × 16 × 32 [hasta 4 mesher workers]
                            4. secciones en cola → escena, con presupuesto por frame
```

### Geometría por secciones (`viewer/mesher.ts`)

- La estructura se divide en secciones de **32 × 16 × 32** (32 de ancho y largo, 16 de alto). Cada
  sección produce **una malla por capa** (opaca, recortada, translúcida): pocas _draw calls_ y
  _frustum culling_ por sección. La altura de 16 permite que las capas oculten secciones por filas;
  la planta de 32 × 32 reduce a un cuarto las mallas frente a 16³.
- Por cada bloque se copian los quads preparados de su estado, desplazados a su posición.
- **Eliminación de caras ocultas:** una cara del lado `d` se omite si el vecino en `d` cubre el
  lado opuesto con caras opacas (`opaqueFaces`), o si es el mismo estado no opaco y ambos cubren
  el lado compartido (cristal contra cristal). Las caras interiores (grupo 6) nunca se omiten.
- **Fluidos:** el modelo y el fluido de cada bloque se recorren por separado. Una cara del fluido se
  omite junto al mismo fluido (agua, bloques anegados, algas, burbujas) o junto a un lado opaco, y
  con el mismo fluido encima se usa la forma a altura completa (sin franjas entre capas de agua).
  Así un lago o un bosque de algas es un solo volumen, como en el juego, y no una superficie por
  bloque; las caras del modelo de un bloque anegado se mantienen. En un mar sintético de
  64 × 32 × 64 con un 20 % de columnas de algas, las caras translúcidas bajaron de 69 764 a 12 032,
  sin cambio apreciable en el tiempo de mallado (unos 41 ms antes; entre 37 y 43 ms después).
- Formato compacto de vértices: posiciones `Float32`, UV `Uint16` normalizadas, color `Uint8`
  normalizado e índices `Uint16` cuando caben. Ocupa menos de la mitad que todo en 32 bits.
- **Varios workers** (`viewer/meshingPlan.ts`): con más de 200 000 bloques se usan hasta 4
  (dejando un núcleo libre). Cada uno malla una banda de filas de secciones con un peso de bloques
  parecido (según `layerBlocks`) y recibe solo sus capas, más una por arriba y otra por abajo para
  las caras ocultas. El primero recibe el array completo y sigue vivo para las tapas de las capas.
  No hace falta `SharedArrayBuffer` (ni cabeceras COOP/COEP en el servidor).
- Cada worker envía cada sección en cuanto la termina y **transfiere** sus arrays.

### Aspecto

- **Sombreado fijo por cara como Minecraft** (arriba 100 %, norte/sur 80 %, este/oeste 60 %,
  abajo 50 %) multiplicado por el tinte en los colores de vértice: materiales sin luces
  (`MeshBasicMaterial`), baratos.
- Atlas con filtrado `Nearest`, sin mipmaps. Cada textura lleva un **borde de 1 px** que repite
  sus píxeles extremos: evita leer la textura vecina del atlas a distancia (antes se veían puntos
  magenta).
- Capa recortada con `alphaTest`; translúcida con mezcla, sin escribir profundidad, dibujada al
  final y en **una sola pasada** (`forceSinglePass`; Three dibujaría dos veces los materiales
  transparentes de doble cara).
- Caras de doble cara: algunos modelos (plantas en cruz, paneles) se ven por ambos lados.

### Interacción y opciones

- Cámara orbital (`CameraManager`): rotar (botón izquierdo), desplazar (derecho), zoom (rueda).
  **Ajustar** encuadra la estructura manteniendo la dirección; vistas **Iso / Arriba / Frente /
  Lado**.
- Cuadrícula, caja de dimensiones, fondo (tema, oscuro, claro, cielo) y panel lateral; se guardan
  en `localStorage`.
- Sin recursos de Minecraft cargados, el visor los pide y no dibuja nada (no se inventan texturas).

### Rendimiento y recursos

- **Dibujado bajo demanda:** solo se dibuja cuando cambia la cámara o la escena (comprobado: 0
  frames con la imagen quieta).
- **Sin copias tras la subida:** los arrays de cada malla se liberan en cuanto llegan a la GPU; la
  selección y las capas usan el array de bloques, no las mallas.
- **Subida progresiva a la GPU:** las secciones se añaden a la escena con un presupuesto de 200 000
  vértices por frame, para no subir cientos de MB en un solo frame.
- Al cambiar de estructura se liberan geometrías, materiales y atlas; si el navegador pierde el
  contexto WebGL, se reconstruye al recuperarlo.
- Mediciones en [PERFORMANCE.md](PERFORMANCE.md).

## Sistema de capas (`feature/layer-system`)

Una capa es un nivel Y de la estructura (la capa 1 es la de abajo). El panel **Capas** permite:

- **Elegir qué se ve:** todas, solo la actual, hasta la actual, desde la actual o un rango.
- **Cambiar de capa:** con las flechas del panel, escribiendo el número, pulsando una fila de la
  lista, con ↑/↓/Inicio/Fin en la lista o con **Re Pág / Av Pág** en cualquier parte del visor.
- **Construir de abajo arriba o de arriba abajo:** las capas ya recorridas en ese sentido se
  marcan ✓, la actual ●, las pendientes ○. El progreso se mide **por bloques**, así las capas
  vacías no cuentan.
- La lista muestra los bloques de cada capa (`Structure.layerBlocks`, calculado al leer el
  archivo en el mismo recorrido que cuenta los materiales).
- La capa actual se marca en 3D con un contorno del color secundario.

El modo y el sentido se recuerdan; la capa actual vuelve al principio con cada estructura. En
pantallas estrechas el panel empieza cerrado para no tapar la vista.

### Cómo se corta sin reconstruir la geometría

```text
setLayerRange({ min, max })
  1. secciones fuera de [min, max] → visible = false   (menos draw calls)
  2. dos planos de recorte en los materiales: y ≤ max + 1 − 0,01 y y ≥ min + 0,01
  3. "tapas": caras superiores del nivel max e inferiores del nivel min   [mesher worker]
```

- **El problema:** la geometría no incluye las caras ocultas por el bloque de encima. Al ocultar
  las capas superiores, el corte mostraría huecos.
- **Los planos** se comparten entre los materiales: moverlos no cambia los shaders ni toca la
  geometría. Se colocan 0,01 bloques **dentro** de la zona visible, así todas las caras que caen
  justo en el corte se eliminan siempre (sin parpadeos por precisión).
- **Las tapas** son las caras de ese lado de todos los bloques del nivel, **sin** quitar las
  ocultas (`Mesher.meshCap`). Usan materiales sin recorte y cierran el corte. Las genera el
  worker de geometría, que ahora **sigue vivo** con la estructura hasta que se cambia de
  estructura. Se guardan las 8 últimas, así volver a una capa reciente es inmediato.
- Si el corte coincide con el borde de la estructura no hay plano ni tapa en ese lado.

Limitaciones: un modelo que sobresale de su bloque por arriba (p. ej. un estandarte de pie) se
corta en el plano; con la tapa recién pedida, el corte puede verse abierto unos milisegundos.

## Inspector de bloques (`feature/block-inspector`)

Un clic (sin arrastrar: arrastrar sigue girando la cámara) selecciona el bloque bajo el cursor.
El bloque se marca con un contorno que se ve a través de los demás, y el inspector muestra:

- **Nombre oficial** del idioma del juego (`blockDisplayName`). Los bloques sin entrada propia,
  como los estandartes o carteles de pared, usan el nombre del objeto que los coloca, como hace
  el juego.
- Id, **posición X, Y, Z** (relativa a la estructura) y su **capa**, con un enlace para ir a ella.
- Cuántos bloques hay **con ese estado** y **de ese tipo** en la estructura.
- **Propiedades** del estado (orientación, mitad, conexiones…).
- **Datos del bloque** (block entity: cofres, carteles, estandartes…) como un árbol NBT
  plegable. Se muestra como texto y nunca se interpreta. Tiene límites de profundidad (8), de
  hijos por nodo (64) y de longitud de texto (200), e indica cuánto se ha omitido.

Escape o la × cierran el inspector; cambiar de estructura borra la selección. En pantallas
estrechas, el inspector oculta el panel de capas mientras está abierto.

### Selección sobre el array de bloques (`viewer/picking.ts`)

No se lanza el rayo contra los triángulos: se recorre la cuadrícula de bloques con el algoritmo
de Amanatides y Woo, desde que el rayo entra en la estructura hasta el primer bloque que no es
aire. Visita como mucho `X + Y + Z` celdas, así cuesta lo mismo en una casa que en una ciudad.
Funciona antes de que termine el mallado y no necesita mallas en el hilo principal.

La caja que recorre el rayo se limita a las **capas visibles**, así un bloque de una capa oculta
nunca se selecciona.

Limitación: se selecciona la celda completa. Un bloque pequeño (una antorcha) se selecciona
también al pulsar en el aire de su celda.

## Limitaciones conocidas

- **Fluidos:** todo fluido es una fuente quieta (altura de su `level`); no se calcula la inclinación
  del agua que corre ni la altura según los bloques vecinos.
- **Estandartes:** solo el color base; los patrones (que están en el block entity) llegarán más
  adelante. Los carteles no muestran su texto.
- **Texturas animadas:** se usa el primer fotograma.
- **Tintes:** colores de bioma por defecto (Deepslate `BlockColors`), no los del bioma real.
