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
        message: 'The block data of {name} is inconsistent or incomplete. The file may be damaged.',
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
    unknownLegacy: '{count} old blocks have no known equivalent and were read as air.',
    approximateLegacy:
      'File from before Minecraft 1.13: blocks that depend on their neighbors (fences, stairs, doors…) may show their default shape.',
    newerThanAssets:
      'The structure is from a newer version (DataVersion {dataVersion}) than the loaded assets ({version}, DataVersion {assetsDataVersion}): some blocks may have no name or texture.',
  },
  materials: {
    title: 'Materials',
    totals: '{items} items · {types} types',
    progress: '{done} of {total} gathered',
    hint: 'Type how many of each material you have under “Have” to see how many are missing.',
    search: 'Search materials',
    sort: {
      label: 'Sort',
      required: 'Most needed',
      missing: 'Most missing',
      name: 'Name',
    },
    filter: {
      label: 'Show',
      all: 'All',
      pending: 'Pending',
      done: 'Complete',
    },
    columns: {
      material: 'Material',
      required: 'Needed',
      stacks: 'Stacks',
      owned: 'Have',
      missing: 'Missing',
    },
    ownedLabel: 'How many {name} you have',
    complete: 'Complete',
    stacksValue: '{stacks} × {size} + {rest}',
    stacksOnly: '{stacks} × {size}',
    shulkers: '≈ {boxes} shulker boxes',
    clear: 'Clear quantities',
    empty: 'This structure needs no materials.',
    noResults: 'No material matches the search.',
    namesNote:
      'Provisional names based on the block id. Load the Minecraft assets to see the official names.',
    namesOfficial: 'Official Minecraft names.',
    special: {
      title: 'Fluids and unobtainable blocks',
      hint: 'Fluids are placed with a bucket. Unobtainable blocks cannot be obtained in survival.',
      fluid: 'Fluid (bucket)',
      unobtainable: 'Unobtainable',
    },
  },
  assets: {
    title: 'Minecraft assets',
    open: 'Load Minecraft assets',
    close: 'Close',
    hint: 'With the assets of your Minecraft you will see the official block names and, later, their textures.',
    intro:
      'LitematicViewer uses the models, textures and names of your own copy of Minecraft Java. Select the client.jar of the version you play: it is read once and stored in this browser.',
    privacy:
      'The file is processed in your browser and is not uploaded to any server. Minecraft assets are not included in the application.',
    select: 'Select client.jar',
    replace: 'Change version',
    remove: 'Remove assets',
    loaded: 'Loaded assets',
    version: 'Version',
    files: 'Files',
    filesValue: '{count} files · {size}',
    whereTitle: 'Where is the client.jar?',
    whereHint:
      'Replace 26.3 with your version. With other launchers (Prism, Modrinth, CurseForge…), look in their versions or libraries folder for a .jar of that version of about 40 MB.',
    indicatorReady: 'Assets {version}',
    indicatorLoading: 'Loading assets…',
    indicatorNone: 'No assets',
    readyTitle: 'Assets loaded',
    ready: 'Minecraft {version}: official names are now shown.',
    removedTitle: 'Assets removed from this browser',
    phase: {
      reading: 'Reading the file…',
      extracting: 'Extracting models, textures and names…',
      saving: 'Saving in the browser…',
    },
    errors: {
      'not-zip': {
        title: 'Not a .jar file',
        message: '{name} is not a ZIP/JAR file.',
      },
      'corrupt-zip': {
        title: 'Damaged file',
        message: '{name} is damaged or uses an unsupported format.',
      },
      'unsafe-archive': {
        title: 'File rejected',
        message: '{name} contains invalid paths and was rejected for safety.',
      },
      'too-large': {
        title: 'File rejected',
        message: '{name} exceeds the size or compression limits and was rejected for safety.',
      },
      'not-client-jar': {
        title: 'Not the client.jar',
        message:
          '{name} does not contain the game assets. If it is the server jar, use the client one (versions folder).',
      },
      'storage-failed': {
        title: 'The assets could not be saved',
        message: 'The browser does not allow storing data (private mode or blocked storage).',
      },
      'read-failed': {
        title: 'The file could not be read',
        message: 'Unexpected error while reading {name}.',
      },
      cancelled: {
        title: 'Loading cancelled',
        message: 'Stopped reading {name}.',
      },
    },
  },
  viewer: {
    toolbar: 'Viewer controls',
    fit: 'Fit',
    views: 'Views',
    view: {
      iso: 'Iso',
      top: 'Top',
      front: 'Front',
      side: 'Side',
    },
    helpers: 'Visual helpers',
    grid: 'Grid',
    box: 'Box',
    background: 'Background',
    backgrounds: {
      theme: 'Theme',
      dark: 'Dark',
      light: 'Light',
      sky: 'Sky',
    },
    panel: 'Panel',
    layers: 'Layers',
    blocks: '{count} blocks',
    phase: {
      models: 'Preparing models…',
      meshing: 'Building geometry…',
    },
    stats: '{sections} sections · {triangles} triangles · {time} ms',
    needAssets:
      'To see the structure in 3D, load the assets of your Minecraft (client.jar). It is only needed once.',
    error: 'The structure could not be shown in 3D.',
    errorTitle: 'Viewer error',
    retry: 'Retry',
    missingTitle: 'Blocks without a model',
    missing:
      '{count} block types have no model in the loaded assets and are shown with the missing texture.',
  },
  layers: {
    title: 'Layers',
    mode: 'Visible layers',
    modes: {
      all: 'All',
      single: 'Current only',
      below: 'Up to current',
      above: 'From current',
      range: 'Range',
    },
    layer: 'Layer',
    layerN: 'Layer {n}',
    up: 'One layer up',
    down: 'One layer down',
    from: 'From',
    to: 'To',
    direction: 'Build',
    directions: {
      up: 'Bottom to top',
      down: 'Top to bottom',
    },
    progress: '{done} of {total} layers built',
    progressLabel: 'Build progress',
    list: 'Layer list',
    empty: 'empty',
    status: {
      done: 'Built',
      current: 'Current',
      pending: 'Pending',
    },
    keys: 'Page Up / Page Down: change layer',
  },
  toast: {
    region: 'Notifications',
    close: 'Close notification',
  },
}
