/**
 * Spanish messages. This file defines the shape of every locale: `en.ts` must
 * provide exactly the same keys (enforced by the `Messages` type).
 *
 * Placeholders use `{name}` syntax and are filled by `translate()`.
 */
export const es = {
  app: {
    name: 'LitematicViewer',
  },
  theme: {
    label: 'Tema',
    system: 'Automático (sistema)',
    light: 'Claro',
    dark: 'Oscuro',
  },
  language: {
    label: 'Idioma',
    es: 'Español',
    en: 'English',
  },
  import: {
    title: 'Arrastra una estructura aquí',
    formats: '.litematic · .schem · .schematic',
    open: 'Abrir archivo',
    dropHere: 'Suelta el archivo para abrirlo',
    localNote: 'Los archivos se procesan en tu navegador. No se suben a ningún servidor.',
    selected: 'Archivo seleccionado',
    notReadyTitle: 'Lectura no disponible todavía',
    notReady: '{name} está listo, pero la lectura de estructuras aún no está implementada.',
    unsupportedTitle: 'Formato no compatible',
    unsupported: '{name} no es un archivo .litematic, .schem ni .schematic.',
    emptyTitle: 'Archivo vacío',
    empty: '{name} no contiene datos.',
    multipleTitle: 'Demasiados archivos',
    multiple: 'Suelta un único archivo de estructura.',
  },
  toast: {
    region: 'Notificaciones',
    close: 'Cerrar notificación',
  },
}
