import type { Messages } from '../translate'

/** English messages. Must match the keys of `es.ts` exactly. */
export const en: Messages = {
  app: {
    name: 'LitematicViewer',
  },
  theme: {
    label: 'Theme',
    system: 'Automatic (system)',
    light: 'Light',
    dark: 'Dark',
  },
  language: {
    label: 'Language',
    es: 'Español',
    en: 'English',
  },
  import: {
    title: 'Drop a structure here',
    formats: '.litematic · .schem · .schematic',
    open: 'Open file',
    dropHere: 'Drop the file to open it',
    localNote: 'Files are processed in your browser. Nothing is uploaded to any server.',
    selected: 'Selected file',
    notReadyTitle: 'Reading not available yet',
    notReady: '{name} is ready, but structure reading is not implemented yet.',
    unsupportedTitle: 'Unsupported format',
    unsupported: '{name} is not a .litematic, .schem or .schematic file.',
    emptyTitle: 'Empty file',
    empty: '{name} contains no data.',
    multipleTitle: 'Too many files',
    multiple: 'Drop a single structure file.',
  },
  toast: {
    region: 'Notifications',
    close: 'Close notification',
  },
}
