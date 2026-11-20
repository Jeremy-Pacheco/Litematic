# Formatos NBT

> **Estado:** pendiente. Ningún parser está implementado todavía.

Este documento describirá cómo se leen los formatos de estructuras soportados, las diferencias
entre ellos y sus versiones, y cómo se convierten al formato interno `Structure`.

Formatos previstos:

| Formato | Extensión | Funcionalidad |
|---|---|---|
| Litematica | `.litematic` | `feature/litematic-parser` |
| Sponge Schematic v1/v2/v3 | `.schem` | `feature/schem-parser` |
| MCEdit / Schematica (anterior a 1.13) | `.schematic` | `feature/legacy-schematic-parser` |

La lectura de NBT se hará con [Deepslate](https://github.com/misode/deepslate). Sus
capacidades y limitaciones reales se documentarán aquí tras investigarlas en
`feature/nbt-reader`.
