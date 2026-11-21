# LitematicViewer

Visor 3D de estructuras de Minecraft para el navegador, inspirado en el mod Litematica.

> **Estado:** en desarrollo. La app abre archivos `.litematic`, `.schem` y `.schematic`,
> comprueba que son válidos y los lee por completo (bloques, paleta, regiones y entidades; los
> `.schematic` antiguos se traducen a bloques modernos). Los **muestra en 3D con las texturas de
> tu propio Minecraft** (cargando su `client.jar`) y calcula la **lista de materiales** con lo
> que te falta, y permite **construir por capas** con su progreso. Al hacer clic en un bloque
> muestra su nombre, posición, propiedades y datos. Pendiente: resource packs. Consulta
> [docs/FEATURES.md](docs/FEATURES.md) para ver el estado de cada funcionalidad.

## Objetivo

- Importar estructuras `.litematic`, `.schem` (Sponge) y `.schematic` (MCEdit).
- Visualizarlas en 3D con las texturas de Minecraft o con un resource pack propio.
- Inspeccionar bloques, construir por capas y consultar la lista de materiales.
- Funcionar con estructuras grandes sin bloquear la interfaz.
- Procesar todos los archivos localmente: nada se sube a ningún servidor.

## Tecnologías

| Área        | Herramienta                                            |
| ----------- | ------------------------------------------------------ |
| Interfaz    | Svelte 5 + TypeScript                                  |
| Compilación | Vite                                                   |
| Render 3D   | Three.js                                               |
| NBT         | Lector propio (lectura) + Deepslate (escritura, tests) |
| Tests       | Vitest                                                 |
| Calidad     | ESLint + Prettier                                      |
| Paquetes    | pnpm                                                   |

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

## Licencia

[MIT](LICENSE) © 2026 Jéremy Paul Pacheco Oña.
