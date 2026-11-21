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
    openAnother: 'Abrir otro archivo',
    selected: 'Archivo seleccionado',
    unsupportedTitle: 'Formato no compatible',
    unsupported: '{name} no es un archivo .litematic, .schem ni .schematic.',
    emptyTitle: 'Archivo vacío',
    empty: '{name} no contiene datos.',
    multipleTitle: 'Demasiados archivos',
    multiple: 'Suelta un único archivo de estructura.',
    reading: 'Leyendo {name}',
    cancel: 'Cancelar',
    readyTitle: 'Estructura leída',
    ready: '{name} se ha leído en {time} ms.',
    mismatchTitle: 'La extensión no coincide',
    mismatch:
      '{name} tiene extensión {extension}, pero su contenido es {format}. Se usa el contenido.',
    blocksPending:
      'Los bloques de este formato todavía no se interpretan: llegará en las próximas versiones.',
    viewerPending: 'Bloques leídos correctamente. La vista 3D llegará en las próximas versiones.',
    errors: {
      'unrecognized-data': {
        title: 'No es un archivo de estructura',
        message: '{name} no contiene datos NBT, ni comprimidos ni sin comprimir.',
      },
      'corrupt-compression': {
        title: 'Archivo dañado',
        message: '{name} está dañado: no se ha podido descomprimir.',
      },
      'too-large': {
        title: 'Archivo demasiado grande',
        message:
          '{name} ocupa más de {limit} al descomprimirse. Se rechaza para proteger la memoria del navegador.',
      },
      'invalid-nbt': {
        title: 'Datos NBT no válidos',
        message: '{name} se ha descomprimido, pero sus datos NBT están dañados o incompletos.',
      },
      'unknown-format': {
        title: 'Formato no reconocido',
        message:
          '{name} es un archivo NBT válido, pero no es una estructura .litematic, .schem ni .schematic.',
      },
      'invalid-structure': {
        title: 'Estructura no válida',
        message:
          'Los datos de bloques de {name} son incoherentes o están incompletos. El archivo puede estar dañado.',
      },
      'structure-too-large': {
        title: 'Estructura demasiado grande',
        message:
          '{name} supera el máximo de {maxBlocks} bloques. Se rechaza para proteger la memoria del navegador.',
      },
      'out-of-memory': {
        title: 'Memoria insuficiente',
        message:
          'El navegador no tiene memoria suficiente para leer {name}. Cierra otras pestañas y vuelve a intentarlo.',
      },
      'read-failed': {
        title: 'No se ha podido leer el archivo',
        message: 'Error inesperado al leer {name}: {detail}',
      },
      cancelled: {
        title: 'Lectura cancelada',
        message: 'Se ha dejado de leer {name}.',
      },
    },
  },
  phase: {
    decompressing: 'Descomprimiendo',
    parsing: 'Interpretando NBT',
    decoding: 'Decodificando bloques',
  },
  format: {
    litematic: 'Litematica',
    schem: 'Sponge Schematic',
    schematic: 'MCEdit Schematic',
  },
  summary: {
    format: 'Formato',
    formatVersion: 'v{version}',
    dataVersion: 'DataVersion',
    dimensions: 'Dimensiones',
    size: 'Tamaño',
    sizeValue: '{compressed} → {decompressed} descomprimido',
    readTime: 'Tiempo de lectura',
    readTimeValue: '{time} ms',
    unknown: 'No indicado',
    author: 'Autor',
    blocks: 'Bloques',
    states: 'Estados distintos',
    regions: 'Regiones',
    objects: 'Entidades',
    objectsValue: '{blockEntities} de bloque · {entities} libres',
  },
  warnings: {
    legacy:
      'Archivo anterior a Minecraft 1.13: los nombres de bloque antiguos se conservan sin convertir.',
    invalidIndices: '{count} bloques usaban un estado inexistente y se han leído como aire.',
    overlap: '{count} posiciones estaban ocupadas por varias regiones; se ha usado la última.',
    skipped: '{count} entidades no tenían una posición válida y se han omitido.',
  },
  toast: {
    region: 'Notificaciones',
    close: 'Cerrar notificación',
  },
}
