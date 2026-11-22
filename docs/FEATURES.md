# Funcionalidades

Leyenda: ✅ implementada · 🚧 en desarrollo · ⏳ pendiente

| #   | Rama                               | Funcionalidad                                                              | Estado |
| --- | ---------------------------------- | -------------------------------------------------------------------------- | ------ |
| —   | `chore/line-endings`               | Finales de línea LF (`.gitattributes`)                                     | ✅     |
| 0   | `chore/project-setup`              | Base técnica: TS estricto, Vitest, ESLint, Prettier, carpetas, docs        | ✅     |
| 1   | `feature/app-shell`                | Layout, identidad visual, temas (oscuro/claro/automático), idiomas (es/en) | ✅     |
| 2   | `feature/nbt-reader`               | Lectura NBT en un Web Worker con validación y progreso                     | ✅     |
| 3   | `feature/litematic-parser`         | Formato `.litematic`                                                       | ✅     |
| 4   | `feature/schem-parser`             | Formato `.schem` (Sponge v1/v2/v3)                                         | ✅     |
| 5   | `feature/legacy-schematic-parser`  | Formato `.schematic` (MCEdit, IDs numéricos)                               | ✅     |
| 6   | `feature/material-list`            | Lista de materiales                                                        | ✅     |
| 7   | `feature/minecraft-assets`         | Carga de recursos desde el `client.jar` del usuario                        | ✅     |
| 8   | `feature/block-models`             | Blockstates, modelos y atlas de texturas                                   | ✅     |
| 9   | `feature/structure-viewer`         | Visor 3D                                                                   | ✅     |
| 10  | `feature/layer-system`             | Construcción por capas                                                     | ✅     |
| 11  | `feature/block-inspector`          | Selección e inspección de bloques                                          | ✅     |
| 12  | `feature/texture-packs`            | Resource packs personalizados                                              | ✅     |
| 13  | `feature/performance-optimization` | Optimización y mediciones de conjunto                                      | ✅     |
| 14  | `feature/legacy-schematic-states`  | `.schematic`: estados de vecinos y de block entities                       | ✅     |
| —   | `fix/legacy-block-renames`         | `.schematic`: nombres de bloque renombrados después de la 1.13             | ✅     |
| —   | `fix/block-state-upgrade`          | Puesta al día de estados de archivos 1.13+ (todos los formatos)            | ✅     |
| —   | `fix/waterlogged-fluids`           | El agua de los bloques anegados se une al agua de alrededor                | ✅     |
| —   | `feature/hanging-sign-text`        | Texto de carteles colgantes; texto colocado sobre el modelo dibujado       | ✅     |
| —   | `fix/model-euler-rotation`         | Modelos 26.x con giros por eje (colgantes con rotación 3, 7, 11 y 15)      | ✅     |
| —   | `feature/sign-font`                | Texto de los carteles con la letra del juego                               | ✅     |
| —   | `feature/flowing-water`            | Agua y lava que corren, con la superficie inclinada como en el juego       | ✅     |
| —   | `fix/memory-assets-fallback`       | Recursos en memoria si el navegador no deja guardarlos (Brave, privado)    | ✅     |
| —   | `feature/animated-textures`        | Texturas animadas (agua, lava, fuego…), con interruptor «Animar»           | ✅     |

La escritura de NBT y las funciones de edición se definirán cuando el visor esté
terminado.
