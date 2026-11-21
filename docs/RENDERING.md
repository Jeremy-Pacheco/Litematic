# Renderizado

> **Estado:** la preparación de modelos y el **visor 3D** están implementados. El sistema de capas
> (`feature/layer-system`) y el inspector de bloques (`feature/block-inspector`) están **pendientes**.

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

| Campo         | Contenido                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| `geometry`    | `geometry[capa][grupo]`: posiciones (0–1), UV, color de tinte y normales por vértice, 4 vértices por quad |
| `opaqueFaces` | Bit por lado: el lado está **totalmente cubierto por caras opacas**                                       |
| `fullFaces`   | Bit por lado: el lado está totalmente cubierto (cualquier capa)                                           |
| `missing`     | El bloque no tiene modelo: se dibuja con la textura de «falta textura»                                    |
| `empty`       | Nada que dibujar (aire)                                                                                   |

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
(`waterlogged`) tiene caras opacas y agua translúcida.

### Bloques especiales

Los bloques que Minecraft dibuja como entidades no tienen modelo JSON y se generan con los
`SpecialRenderers` de Deepslate: cofres, carteles (sin texto), camas, estandartes (color base, sin
patrones todavía), cabezas, cajas de shulker, campanas, macetas decoradas y fluidos.

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
                            3. Mesher por secciones de 16³      [mesher worker]
                            4. secciones en cola → escena, con presupuesto por frame
```

### Geometría por secciones (`viewer/mesher.ts`)

- La estructura se divide en secciones de 16 × 16 × 16. Cada sección produce **una malla por
  capa** (opaca, recortada, translúcida): pocas _draw calls_ y _frustum culling_ por sección.
- Por cada bloque se copian los quads preparados de su estado, desplazados a su posición.
- **Eliminación de caras ocultas:** una cara del lado `d` se omite si el vecino en `d` cubre el
  lado opuesto con caras opacas (`opaqueFaces`), o si es el mismo estado no opaco y ambos cubren
  el lado compartido (cristal contra cristal). Las caras interiores (grupo 6) nunca se omiten.
- Formato compacto de vértices: posiciones `Float32`, UV `Uint16` normalizadas, color `Uint8`
  normalizado e índices `Uint16` cuando caben. Ocupa menos de la mitad que todo en 32 bits.
- El worker envía cada sección en cuanto la termina (de abajo arriba) y **transfiere** sus arrays.
  El array de bloques se le envía **copiado** (decisión aprobada; compartirlo con
  `SharedArrayBuffer` exigiría cabeceras COOP/COEP y se valorará en la optimización final).

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
- **Subida progresiva a la GPU:** las secciones se añaden a la escena con un presupuesto de 200 000
  vértices por frame, para no subir cientos de MB en un solo frame.
- Al cambiar de estructura se liberan geometrías, materiales y atlas; si el navegador pierde el
  contexto WebGL, se reconstruye al recuperarlo.
- Mediciones en [PERFORMANCE.md](PERFORMANCE.md).

## Limitaciones conocidas

- **Fluidos:** la altura de la superficie se prepara sin conocer el bloque de encima; en columnas de
  agua pueden verse superficies internas. Se resolverá en el visor si es necesario.
- **Estandartes:** solo el color base; los patrones (que están en el block entity) llegarán más
  adelante. Los carteles no muestran su texto.
- **Texturas animadas:** se usa el primer fotograma.
- **Tintes:** colores de bioma por defecto (Deepslate `BlockColors`), no los del bioma real.
