import { STRUCTURE_EXTENSIONS, type StructureFormat } from '../constants/formats'

/** Minimal file description, so the check works with `File` and in tests. */
export interface FileLike {
  readonly name: string
  readonly size: number
}

export type StructureFileCheck =
  { ok: true; format: StructureFormat } | { ok: false; reason: 'empty' | 'unsupported' }

/**
 * Guesses the format from the file name. Case-insensitive.
 *
 * This is only a **hint** used to give quick feedback in the UI. The name of a
 * file is not trusted: the real validation (magic bytes and NBT structure)
 * happens when the file is read in `feature/nbt-reader`.
 */
export function formatFromFileName(name: string): StructureFormat | null {
  const lower = name.toLowerCase()
  for (const [format, extension] of Object.entries(STRUCTURE_EXTENSIONS)) {
    if (lower.endsWith(extension)) return format as StructureFormat
  }
  return null
}

/** Quick pre-check of a selected file before trying to read it. */
export function checkStructureFile(file: FileLike): StructureFileCheck {
  const format = formatFromFileName(file.name)
  if (!format) return { ok: false, reason: 'unsupported' }
  if (file.size === 0) return { ok: false, reason: 'empty' }
  return { ok: true, format }
}
