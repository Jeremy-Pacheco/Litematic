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
    openAnother: 'Open another file',
    selected: 'Selected file',
    unsupportedTitle: 'Unsupported format',
    unsupported: '{name} is not a .litematic, .schem or .schematic file.',
    emptyTitle: 'Empty file',
    empty: '{name} contains no data.',
    multipleTitle: 'Too many files',
    multiple: 'Drop a single structure file.',
    reading: 'Reading {name}',
    cancel: 'Cancel',
    readyTitle: 'Structure read',
    ready: '{name} was read in {time} ms.',
    mismatchTitle: 'Extension does not match',
    mismatch:
      '{name} has the {extension} extension, but its content is {format}. The content is used.',
    blocksPending:
      'Blocks of this format are not interpreted yet: it arrives in upcoming versions.',
    viewerPending: 'Blocks read successfully. The 3D view arrives in upcoming versions.',
    errors: {
      'unrecognized-data': {
        title: 'Not a structure file',
        message: '{name} contains no NBT data, compressed or uncompressed.',
      },
      'corrupt-compression': {
        title: 'Damaged file',
        message: '{name} is damaged: it could not be decompressed.',
      },
      'too-large': {
        title: 'File too large',
        message:
          '{name} is larger than {limit} once decompressed. It is rejected to protect the browser memory.',
      },
      'invalid-nbt': {
        title: 'Invalid NBT data',
        message: '{name} was decompressed, but its NBT data is damaged or incomplete.',
      },
      'unknown-format': {
        title: 'Unrecognized format',
        message: '{name} is valid NBT, but not a .litematic, .schem or .schematic structure.',
      },
      'invalid-structure': {
        title: 'Invalid structure',
        message: 'The block data of {name} is inconsistent: {detail}',
      },
      'structure-too-large': {
        title: 'Structure too large',
        message:
          '{name} exceeds the maximum of {maxBlocks} blocks. It is rejected to protect the browser memory.',
      },
      'out-of-memory': {
        title: 'Not enough memory',
        message:
          'The browser does not have enough memory to read {name}. Close other tabs and try again.',
      },
      'read-failed': {
        title: 'The file could not be read',
        message: 'Unexpected error while reading {name}: {detail}',
      },
      cancelled: {
        title: 'Reading cancelled',
        message: 'Stopped reading {name}.',
      },
    },
  },
  phase: {
    decompressing: 'Decompressing',
    parsing: 'Interpreting NBT',
    decoding: 'Decoding blocks',
  },
  format: {
    litematic: 'Litematica',
    schem: 'Sponge Schematic',
    schematic: 'MCEdit Schematic',
  },
  summary: {
    format: 'Format',
    formatVersion: 'v{version}',
    dataVersion: 'DataVersion',
    dimensions: 'Dimensions',
    size: 'Size',
    sizeValue: '{compressed} → {decompressed} decompressed',
    readTime: 'Read time',
    readTimeValue: '{time} ms',
    unknown: 'Not recorded',
    author: 'Author',
    blocks: 'Blocks',
    states: 'Distinct states',
    regions: 'Regions',
    objects: 'Entities',
    objectsValue: '{blockEntities} block · {entities} free',
  },
  warnings: {
    legacy: 'File from before Minecraft 1.13: old block names are kept unconverted.',
    invalidIndices: '{count} blocks used a missing state and were read as air.',
    overlap: '{count} positions were taken by several regions; the last one was used.',
    skipped: '{count} entities had no valid position and were skipped.',
  },
  toast: {
    region: 'Notifications',
    close: 'Close notification',
  },
}
