# Arquitectura

## Estado actual

Solo existe la base del proyecto. Las carpetas de `src/lib/` están creadas (con `.gitkeep`)
pero vacías, salvo `utils/`.

```text
src/
├── lib/
│   ├── components/      Componentes Svelte, agrupados por área
│   │   ├── layout/      Estructura principal de la app (cabecera, paneles)
│   │   ├── viewer/      Lienzo 3D y superposiciones del visor
│   │   ├── controls/    Controles reutilizables (botones, sliders, selects)
│   │   ├── materials/   Lista de materiales
│   │   ├── layers/      Selector de capas
│   │   └── dialogs/     Ventanas modales
│   ├── managers/        Clases que gestionan escena, cámara, recursos, etc.
│   ├── parsers/         Lectura de .litematic, .schem y .schematic
│   ├── workers/         Web Workers para el trabajo pesado
│   ├── stores/          Estado global de Svelte
│   ├── types/           Tipos compartidos
│   ├── utils/           Funciones puras sin dependencias de la interfaz
│   └── constants/       Constantes compartidas
├── assets/              Recursos propios de la app (no de Minecraft)
├── App.svelte           Componente raíz
├── app.css              Estilos globales
└── main.ts              Punto de entrada
tests/                   Tests de Vitest, con la misma estructura que src/
docs/                    Documentación
```

### Módulos implementados

| Módulo            | Responsabilidad                                             |
| ----------------- | ----------------------------------------------------------- |
| `utils/format.ts` | `formatBytes`: formatea tamaños de archivo en B/KB/MB/GB/TB |

## Principios

- **`App.svelte` no contiene lógica de negocio.** Solo compone componentes.
- **Un formato interno único.** Cada parser convertirá su formato a un mismo tipo
  `Structure`; el resto de la app no sabrá de qué formato viene la estructura.
- **El trabajo pesado va en Web Workers** (descompresión, NBT, geometría, materiales,
  texturas) para no bloquear la interfaz.
- **Cada manager tiene una única responsabilidad** y no hay dependencias circulares.

## Diseño previsto (no implementado)

Los managers y el flujo de importación se documentarán aquí a medida que se implementen.
Ver [FEATURES.md](FEATURES.md) para el orden previsto.
