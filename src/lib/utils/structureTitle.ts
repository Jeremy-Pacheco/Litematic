/**
 * Placeholder names that tools write when the user did not name the
 * structure (Litematica uses "Unnamed"). Compared case-insensitively.
 */
const GENERIC_NAMES = new Set(['unnamed', 'untitled'])

/**
 * Title shown for a structure: its own name when it is meaningful, otherwise
 * the file name, which is usually what the user recognizes.
 */
export function structureTitle(name: string | null | undefined, fileName: string): string {
  const trimmed = name?.trim()
  if (!trimmed || GENERIC_NAMES.has(trimmed.toLowerCase())) return fileName
  return trimmed
}
