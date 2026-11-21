/** Structure file formats the app intends to support. */
export type StructureFormat = 'litematic' | 'schem' | 'schematic'

/** File extension (lowercase, with dot) associated with each format. */
export const STRUCTURE_EXTENSIONS: Readonly<Record<StructureFormat, string>> = {
  litematic: '.litematic',
  schem: '.schem',
  schematic: '.schematic',
}

/** Value for the `accept` attribute of the file picker. */
export const STRUCTURE_ACCEPT = Object.values(STRUCTURE_EXTENSIONS).join(',')
