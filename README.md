# LitematicViewer

Visor 3D de estructuras de Minecraft para el navegador, inspirado en el mod Litematica.

**Pruébalo en https://litematic.jeremypacheco.es** — tus archivos se procesan en tu navegador y
no se suben a ningún servidor. Con tu permiso se usa Google Analytics para contar visitas.

> **Estado:** las 13 funcionalidades del plan inicial están implementadas. La app abre archivos `.litematic`, `.schem` y `.schematic`,
> comprueba que son válidos y los lee por completo (bloques, paleta, regiones y entidades; los
> `.schematic` antiguos se traducen a bloques modernos). Los **muestra en 3D con las texturas de
> tu propio Minecraft** (cargando su `client.jar`) y calcula la **lista de materiales** con lo
> que te falta, y permite **construir por capas** con su progreso. Al hacer clic en un bloque
> muestra su nombre, posición, propiedades y datos. También admite **resource packs** `.zip` y
> estructuras de decenas de millones de bloques (ver [docs/PERFORMANCE.md](docs/PERFORMANCE.md)).
> Consulta [docs/FEATURES.md](docs/FEATURES.md) para ver el estado de cada funcionalidad.

## Objetivo

- Importar estructuras `.litematic`, `.schem` (Sponge) y `.schematic` (MCEdit).
- Visualizarlas en 3D con las texturas de Minecraft o con un resource pack propio.
- Inspeccionar bloques, construir por capas y consultar la lista de materiales.
- Funcionar con estructuras grandes sin bloquear la interfaz.
- Procesar todos los archivos localmente: nada se sube a ningún servidor.

## Tecnologías

| Área        | Herramienta                                               |
| ----------- | --------------------------------------------------------- |
| Interfaz    | Svelte 5 + TypeScript                                     |
| Compilación | Vite                                                      |
| Render 3D   | Three.js                                                  |
| Modelos     | Deepslate (modelos de bloque y renderizadores especiales) |
| NBT         | Lector propio                                             |
| ZIP         | fflate                                                    |
| Tests       | Vitest                                                    |
| Calidad     | ESLint + Prettier                                         |
| Paquetes    | pnpm                                                      |

## Requisitos

- Node.js 24 o superior.
- pnpm 11 o superior.

## Comandos

```bash
pnpm install        # instalar dependencias
pnpm dev            # servidor de desarrollo
pnpm build          # compilación de producción en dist/
pnpm preview        # previsualizar la compilación
pnpm check          # comprobación de tipos (svelte-check + tsc)
pnpm lint           # ESLint
pnpm format         # formatear con Prettier
pnpm format:check   # comprobar el formato sin modificar
pnpm test           # ejecutar los tests una vez
pnpm test:watch     # tests en modo observación
pnpm test:perf      # mediciones de memoria y tiempo (más lento; no forma parte de pnpm test)
```

## Documentación

| Documento                                   | Contenido                                                |
| ------------------------------------------- | -------------------------------------------------------- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md)     | Estructura del proyecto y responsabilidad de cada módulo |
| [FEATURES.md](docs/FEATURES.md)             | Funcionalidades y su estado                              |
| [CONTRIBUTING.md](docs/CONTRIBUTING.md)     | Flujo de trabajo, ramas y convenciones                   |
| [NBT-FORMATS.md](docs/NBT-FORMATS.md)       | Formatos de estructuras y su lectura                     |
| [RENDERING.md](docs/RENDERING.md)           | Funcionamiento del renderizado                           |
| [TEXTURE-SYSTEM.md](docs/TEXTURE-SYSTEM.md) | Texturas, modelos y resource packs                       |
| [PERFORMANCE.md](docs/PERFORMANCE.md)       | Optimizaciones y mediciones                              |

## Recursos de Minecraft

Las texturas y modelos de Minecraft son propiedad de Mojang y **no se incluyen en este
repositorio**. La aplicación los leerá del `client.jar` que el propio usuario seleccione
desde su instalación de Minecraft, de forma totalmente local.

LitematicViewer no está afiliado ni respaldado por Mojang Studios ni por Microsoft.
Minecraft es una marca de Mojang Synergies AB.

## Créditos

LitematicViewer se apoya en estos proyectos de código abierto. Gracias a sus autores:

- **[Deepslate](https://github.com/misode/deepslate)** de **Misode** (MIT): lee los modelos de
  bloque de Minecraft y dibuja cofres, estandartes y fluidos. Es la base del visor 3D.
- **[Three.js](https://threejs.org)** de mrdoob y colaboradores (MIT): render 3D con WebGL.
- **[fflate](https://github.com/101arrowz/fflate)** de Arjun Barrett (MIT): lectura del
  `client.jar` y de los resource packs.
- **[Svelte](https://svelte.dev)** (MIT): la interfaz.
- **[minecraft-data](https://github.com/PrismarineJS/minecraft-data)** de PrismarineJS (MIT):
  tabla de IDs antiguos para los `.schematic`.

Cada build genera `licenses.txt` con la licencia completa de todo el software incluido en la web
(también las dependencias de Deepslate). En la app, el botón de información de la barra superior
muestra los créditos.

LitematicViewer no es un producto oficial de Minecraft. No está aprobado por Mojang ni Microsoft
ni asociado con ellos.

## Licencia

[MIT](LICENSE) © 2026 Jéremy Paul Pacheco Oña.
