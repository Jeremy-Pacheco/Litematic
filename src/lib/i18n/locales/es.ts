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
    unknownLegacy:
      '{count} bloques antiguos no tienen un equivalente conocido y se han leído como aire.',
    approximateLegacy:
      'Archivo anterior a Minecraft 1.13: los bloques que dependen de sus vecinos (vallas, escaleras, puertas…) pueden verse con su forma por defecto.',
    newerThanAssets:
      'La estructura es de una versión más nueva (DataVersion {dataVersion}) que los recursos cargados ({version}, DataVersion {assetsDataVersion}): algunos bloques pueden no tener nombre ni textura.',
  },
  materials: {
    title: 'Materiales',
    totals: '{items} ítems · {types} tipos',
    progress: '{done} de {total} conseguidos',
    hint: 'Escribe en «Tengo» cuántos tienes de cada material para ver cuántos te faltan.',
    search: 'Buscar material',
    sort: {
      label: 'Ordenar',
      required: 'Más necesarios',
      missing: 'Más pendientes',
      name: 'Nombre',
    },
    filter: {
      label: 'Mostrar',
      all: 'Todos',
      pending: 'Pendientes',
      done: 'Completos',
    },
    columns: {
      material: 'Material',
      required: 'Necesarios',
      stacks: 'Stacks',
      owned: 'Tengo',
      missing: 'Faltan',
    },
    ownedLabel: 'Cantidad que tienes de {name}',
    complete: 'Completo',
    stacksValue: '{stacks} × {size} + {rest}',
    stacksOnly: '{stacks} × {size}',
    shulkers: '≈ {boxes} cajas de shulker',
    clear: 'Borrar cantidades',
    empty: 'Esta estructura no necesita materiales.',
    noResults: 'Ningún material coincide con la búsqueda.',
    namesNote:
      'Nombres provisionales a partir del identificador del bloque. Para ver los nombres oficiales, carga los recursos de Minecraft.',
    namesOfficial:
      'Nombres oficiales de Minecraft, en inglés: el client.jar no incluye otros idiomas.',
    special: {
      title: 'Fluidos y bloques no obtenibles',
      hint: 'Los fluidos se colocan con un cubo. Los bloques no obtenibles no se pueden conseguir en supervivencia.',
      fluid: 'Fluido (cubo)',
      unobtainable: 'No obtenible',
    },
  },
  assets: {
    title: 'Recursos de Minecraft',
    open: 'Cargar recursos de Minecraft',
    close: 'Cerrar',
    hint: 'Con los recursos de tu Minecraft verás los nombres oficiales de los bloques y, más adelante, sus texturas.',
    intro:
      'LitematicViewer usa los modelos, texturas y nombres de tu propia copia de Minecraft Java. Selecciona el client.jar de la versión que uses: se lee una sola vez y se guarda en este navegador.',
    privacy:
      'El archivo se procesa en tu navegador y no se sube a ningún servidor. Los recursos de Minecraft no se incluyen en la aplicación.',
    select: 'Seleccionar client.jar',
    replace: 'Cambiar de versión',
    remove: 'Quitar recursos',
    loaded: 'Recursos cargados',
    version: 'Versión',
    files: 'Archivos',
    filesValue: '{count} archivos · {size}',
    whereTitle: '¿Dónde está el client.jar?',
    whereHint:
      'Cambia 26.3 por tu versión. Con otros launchers (Prism, Modrinth, CurseForge…), busca en su carpeta de versiones o bibliotecas un .jar de la versión de unos 40 MB.',
    indicatorReady: 'Recursos {version}',
    indicatorLoading: 'Cargando recursos…',
    indicatorNone: 'Sin recursos',
    readyTitle: 'Recursos cargados',
    ready: 'Minecraft {version}: ya se muestran los nombres oficiales.',
    removedTitle: 'Recursos eliminados de este navegador',
    phase: {
      reading: 'Leyendo el archivo…',
      extracting: 'Extrayendo modelos, texturas y nombres…',
      saving: 'Guardando en el navegador…',
    },
    errors: {
      'not-zip': {
        title: 'No es un archivo .jar',
        message: '{name} no es un archivo ZIP/JAR.',
      },
      'corrupt-zip': {
        title: 'Archivo dañado',
        message: '{name} está dañado o usa un formato no compatible.',
      },
      'unsafe-archive': {
        title: 'Archivo rechazado',
        message: '{name} contiene rutas no válidas y se ha rechazado por seguridad.',
      },
      'too-large': {
        title: 'Archivo rechazado',
        message:
          '{name} supera los límites de tamaño o de compresión y se ha rechazado por seguridad.',
      },
      'not-client-jar': {
        title: 'No es el client.jar',
        message:
          '{name} no contiene los recursos del juego. Si es el jar del servidor, usa el del cliente (carpeta versions).',
      },
      'not-resource-pack': {
        title: 'No es un resource pack',
        message:
          '{name} no tiene pack.mcmeta. Comprueba que es un resource pack de Minecraft Java.',
      },
      'storage-failed': {
        title: 'No se han podido guardar los recursos',
        message: 'El navegador no permite guardar datos (modo privado o almacenamiento bloqueado).',
      },
      'read-failed': {
        title: 'No se ha podido leer el archivo',
        message: 'Error inesperado al leer {name}.',
      },
      cancelled: {
        title: 'Carga cancelada',
        message: 'Se ha dejado de leer {name}.',
      },
    },
  },
  viewer: {
    canvas: 'Vista 3D de la estructura',
    toolbar: 'Controles del visor',
    fit: 'Ajustar',
    views: 'Vistas',
    view: {
      iso: 'Iso',
      top: 'Arriba',
      front: 'Frente',
      side: 'Lado',
    },
    helpers: 'Ayudas visuales',
    grid: 'Cuadrícula',
    box: 'Caja',
    background: 'Fondo',
    backgrounds: {
      theme: 'Tema',
      dark: 'Oscuro',
      light: 'Claro',
      sky: 'Cielo',
    },
    panel: 'Panel',
    layers: 'Capas',
    blocks: '{count} bloques',
    phase: {
      models: 'Preparando modelos…',
      meshing: 'Construyendo geometría…',
    },
    stats: '{sections} secciones · {triangles} triángulos · {time} ms',
    needAssets:
      'Para ver la estructura en 3D, carga los recursos de tu Minecraft (client.jar). Solo hace falta una vez.',
    error: 'No se ha podido mostrar la estructura en 3D.',
    errorTitle: 'Error en el visor',
    retry: 'Reintentar',
    missingTitle: 'Bloques sin modelo',
    missing:
      '{count} tipos de bloque no tienen modelo en los recursos cargados y se muestran con la textura de «falta textura».',
  },
  layers: {
    title: 'Capas',
    mode: 'Capas visibles',
    modes: {
      all: 'Todas',
      single: 'Solo la actual',
      below: 'Hasta la actual',
      above: 'Desde la actual',
      range: 'Rango',
    },
    layer: 'Capa',
    layerN: 'Capa {n}',
    up: 'Subir una capa',
    down: 'Bajar una capa',
    from: 'Desde',
    to: 'Hasta',
    direction: 'Construir',
    directions: {
      up: 'De abajo arriba',
      down: 'De arriba abajo',
    },
    progress: '{done} de {total} capas construidas',
    progressLabel: 'Progreso de construcción',
    list: 'Lista de capas',
    empty: 'vacía',
    status: {
      done: 'Construida',
      current: 'Actual',
      pending: 'Pendiente',
    },
    keys: 'Re Pág / Av Pág: cambiar de capa',
  },
  inspector: {
    hint: 'Clic en un bloque para inspeccionarlo',
    close: 'Cerrar el inspector',
    position: 'Posición',
    layer: 'Capa',
    goToLayer: 'Ir a su capa',
    inStructure: 'En la estructura',
    count: '{state} con este estado · {total} en total',
    properties: 'Propiedades',
    noProperties: 'Sin propiedades',
    blockEntity: 'Datos del bloque',
    more: '… y {count} más',
    hiddenLayer: 'Su capa está oculta.',
  },
  pack: {
    title: 'Resource pack',
    intro:
      'Importa un resource pack (.zip) para ver la estructura con sus texturas y modelos. Lo que falte en el pack se toma de tus recursos de Minecraft.',
    needAssets: 'Carga primero los recursos de Minecraft: el pack se aplica sobre ellos.',
    select: 'Importar resource pack',
    replace: 'Cambiar de pack',
    remove: 'Quitar pack',
    icon: 'Icono del pack',
    format: 'Formato',
    compatibility: 'Compatibilidad',
    compatible: 'Hecho para esta versión',
    otherVersion: 'Hecho para otra versión (formatos {min}–{max}; tus recursos usan el {game})',
    unknown: 'Desconocida',
    files: 'Archivos usados',
    overlays: 'Overlays aplicados',
    rejected: 'Texturas ignoradas',
    rejectedValue: '{count}: demasiado grandes o no válidas (se usan las del juego)',
    noFiles: 'Este pack no cambia ningún bloque: no tiene texturas, modelos ni estados de bloque.',
    readyTitle: 'Resource pack cargado',
    ready: '{name}: la vista 3D usa sus texturas.',
    otherVersionTitle: 'Pack de otra versión',
    otherVersionMessage:
      '{name} se hizo para otra versión de Minecraft. Puede que algunas texturas no coincidan.',
    removedTitle: 'Resource pack quitado: se usan las texturas del juego',
    reducedTitle: 'Texturas reducidas',
    reduced:
      'Las texturas del pack no caben a su resolución en una sola textura de la GPU y se muestran a 1/{scale}.',
    indicator: 'Pack: {name}',
    notZipTitle: 'No es un archivo .zip',
    notZip: '{name} no es un archivo ZIP.',
  },
  toast: {
    region: 'Notificaciones',
    close: 'Cerrar notificación',
  },
}
