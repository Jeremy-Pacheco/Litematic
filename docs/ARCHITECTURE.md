# Arquitectura

## Estructura

```text
src/
├── lib/
│   ├── components/      Componentes Svelte, agrupados por área
│   │   ├── layout/      Estructura principal (AppShell, TopBar)
│   │   ├── controls/    Controles reutilizables (Button, Icon, SegmentedControl…)
│   │   ├── import/      Pantalla de importación y zona de arrastrar y soltar
│   │   ├── feedback/    Notificaciones
│   │   ├── viewer/      Lienzo 3D (pendiente)
│   │   ├── materials/   Lista de materiales (pendiente)
│   │   ├── layers/      Selector de capas (pendiente)
│   │   └── dialogs/     Ventanas modales (pendiente)
│   ├── i18n/            Idiomas: diccionarios y traducción
│   ├── styles/          Variables de diseño (tokens.css)
│   ├── stores/          Estado global reactivo (runas de Svelte 5)
│   ├── constants/       Constantes compartidas
│   ├── utils/           Funciones puras sin dependencias de la interfaz
│   ├── managers/        Escena, cámara, recursos… (pendiente)
│   ├── parsers/         Lectura de .litematic, .schem y .schematic (pendiente)
│   ├── workers/         Web Workers (pendiente)
│   └── types/           Tipos compartidos (pendiente)
├── App.svelte           Componente raíz: solo compone AppShell + pantalla actual
├── app.css              Estilos base globales
└── main.ts              Punto de entrada: carga preferencias y monta la app
tests/                   Tests de Vitest, con la misma estructura que src/
docs/                    Documentación
```

## Módulos implementados

| Módulo                           | Responsabilidad                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| `styles/tokens.css`              | Paleta, tipografía, espaciado, radios y duración de animaciones                         |
| `stores/theme.svelte.ts`         | Tema elegido (automático, claro, oscuro) y tema efectivo                                |
| `i18n/translate.ts`              | Tipos de mensajes, `translate()` y detección del idioma del navegador                   |
| `i18n/i18n.svelte.ts`            | Idioma activo y función `t()` reactiva                                                  |
| `i18n/locales/{es,en}.ts`        | Textos de la interfaz                                                                   |
| `stores/toasts.svelte.ts`        | Cola de notificaciones con cierre automático                                            |
| `stores/importState.svelte.ts`   | Archivo de estructura seleccionado por el usuario                                       |
| `utils/structureFile.ts`         | Comprobación previa del archivo (extensión y tamaño cero)                               |
| `utils/storage.ts`               | Acceso a `localStorage` que no rompe la app si no está disponible                       |
| `utils/format.ts`                | `formatBytes`: tamaño de archivo legible según el idioma                                |
| `constants/formats.ts`           | Formatos de estructura y sus extensiones                                                |
| `constants/storage.ts`           | Claves de `localStorage`                                                                |
| `components/layout/AppShell`     | Barra superior + contenido + notificaciones                                             |
| `components/layout/TopBar`       | Marca, archivo seleccionado (nombre y tamaño), idioma y tema                            |
| `components/import/ImportScreen` | Valida la selección y la pasa a `importState`, o muestra un error                       |
| `components/import/DropZone`     | Selector de archivo y arrastrar y soltar en toda la ventana                             |
| `components/feedback/Toaster`    | Muestra las notificaciones (`aria-live`), respeta `prefers-reduced-motion`              |
| `components/controls/*`          | `Button`, `Icon` (SVG propios), `SegmentedControl`, `ThemeSwitcher`, `LanguageSwitcher` |

## Interfaz

### Identidad visual

- **Principal: cobre** (`--color-primary`). Botones principales, selección, foco.
- **Secundario: cobre oxidado / verdín** (`--color-secondary`). Progreso y estados correctos.
- **Neutros: grises pizarra** fríos para fondos, paneles, bordes y texto.
- **Error**: rojo, claramente distinto del cobre.
- Tipografía del sistema para la interfaz y monoespaciada para nombres de archivo, formatos,
  coordenadas y cantidades. No se descargan fuentes.

Los pares principales cumplen WCAG 2.1 AA (≥ 4,5:1 para texto).

### Temas

Cada color se declara una sola vez con `light-dark(claro, oscuro)` en `tokens.css`:

- **Automático**: `<html>` no tiene `data-theme`; `color-scheme: light dark` hace que el
  navegador elija según `prefers-color-scheme`, también si cambia en directo.
- **Claro / oscuro**: `ThemeStore` pone `data-theme="light"` o `"dark"` en `<html>`, lo que fija
  `color-scheme` y por tanto el valor de `light-dark()`.
- La elección se guarda en `localStorage` (`lv:theme`). Un script en línea en `index.html` la
  aplica **antes del primer pintado** para evitar un parpadeo del tema equivocado.
- `theme.resolved` expone el tema efectivo para el código que no puede usar CSS (por ejemplo,
  el fondo del futuro visor 3D).

Requiere navegadores con soporte de `light-dark()`: Chrome/Edge 123+, Firefox 120+, Safari 17.5+.

### Idiomas

- `es.ts` define la forma de los mensajes; `en.ts` está tipado con `Messages`, así que
  TypeScript da error si le falta o le sobra una clave. Un test comprueba además que ambos
  idiomas tienen las mismas claves y los mismos `{parámetros}`.
- `i18n.t('import.title')` acepta solo claves que existen (`MessageKey`).
- Primera visita: se usa el primer idioma compatible de `navigator.languages` (`es-MX` → `es`);
  si ninguno lo es, inglés. Después se recuerda la elección (`lv:locale`) y se actualiza el
  atributo `lang` de `<html>`.
- Las notificaciones guardan claves, no texto, así que se traducen de nuevo si cambia el idioma.

### Importación (estado actual)

1. El usuario elige un archivo o lo suelta en cualquier parte de la ventana.
2. `checkStructureFile` hace una comprobación **orientativa** por extensión y tamaño. La
   extensión no es fiable: la validación real del contenido llegará con `feature/nbt-reader`.
3. Si pasa, se guarda en `importState` y la barra superior muestra nombre y tamaño.
4. Como la lectura aún no existe, se muestra un aviso que lo dice explícitamente.

## Principios

- **`App.svelte` no contiene lógica de negocio.** Solo compone componentes.
- **Lógica pura separada del estado reactivo.** Las funciones testeables (`resolveTheme`,
  `translate`, `detectLocale`, `checkStructureFile`…) no dependen de Svelte ni del DOM; los
  stores solo las conectan con el navegador.
- **Un formato interno único.** Cada parser convertirá su formato a un mismo tipo
  `Structure`; el resto de la app no sabrá de qué formato viene la estructura.
- **El trabajo pesado va en Web Workers** (descompresión, NBT, geometría, materiales,
  texturas) para no bloquear la interfaz.
- **Cada manager tiene una única responsabilidad** y no hay dependencias circulares.
- **Sin alertas del navegador.** Errores y avisos usan las notificaciones propias.
