import { textOf } from '../utils/textComponent'
import { AssetError } from './errors'

export { textOf }
import { readZip, type ZipLimits } from './zipReader'

/**
 * Reads a user resource pack (`.zip`): its `pack.mcmeta`, its icon and the
 * files the viewer can use (block states, block models, fonts, textures), with the
 * overlays that apply to the loaded game version already merged in.
 *
 * The result is a map of files with the same paths as the client jar
 * (`assets/<namespace>/...`), so it can simply be laid over the game files:
 * anything the pack does not have keeps the game's version.
 */

/** Largest side and pixel count accepted for one texture of a pack. */
export const MAX_TEXTURE_SIDE = 4096
export const MAX_TEXTURE_PIXELS = 16 * 1024 * 1024

const ASSET_FILE =
  /^assets\/[a-z0-9_.-]+\/(blockstates\/[^/]+\.json|models\/.+\.json|font\/.+\.json|textures\/.+\.(png|mcmeta))$/
/** Up to two leading folders: the zip's own root folder and an overlay folder. */
const WANTED = new RegExp(
  `^(?:[^/]+/){0,2}(?:pack\\.mcmeta|pack\\.png|${ASSET_FILE.source.slice(1, -1)})$`,
)
const OVERLAY_DIR = /^[a-z0-9_.-]+$/

export interface FormatRange {
  min: number
  max: number
}

export interface PackInfo {
  /** Plain text of the description (formatting codes removed). */
  description: string
  /** Main format the pack declares. */
  packFormat: number | null
  /** Every format the pack says it supports. */
  supported: FormatRange | null
  /** Overlay folders applied for the game's format, in order. */
  overlays: string[]
  /** Pack textures ignored for being too large or not real PNGs (the game's are used). */
  rejectedTextures: string[]
}

export interface ResourcePack {
  info: PackInfo
  /** Usable files, by the same paths as the client jar. */
  files: Map<string, Uint8Array>
  icon: Uint8Array | null
}

export function isWantedPackEntry(name: string): boolean {
  return WANTED.test(name)
}

/**
 * @param gameFormat resource pack format of the loaded game (to pick overlays).
 * @throws {AssetError} `not-resource-pack` without a valid `pack.mcmeta`, plus
 * the ZIP errors of `readZip`.
 */
export function readResourcePack(
  data: Uint8Array,
  gameFormat: number | null,
  limits?: Partial<ZipLimits>,
): ResourcePack {
  const entries = readZip(data, { accept: isWantedPackEntry, limits })
  const root = findRoot(entries)
  if (root === null) {
    throw new AssetError('not-resource-pack', 'The archive has no pack.mcmeta')
  }
  const mcmeta = parseMcmeta(entries.get(`${root}pack.mcmeta`)!)

  const overlays = applicableOverlays(mcmeta.overlays, gameFormat)
  const files = new Map<string, Uint8Array>()
  // Base files first, then each overlay on top, in the order the pack lists them.
  for (const prefix of [root, ...overlays.map((dir) => `${root}${dir}/`)]) {
    for (const [name, bytes] of entries) {
      if (!name.startsWith(prefix)) continue
      const path = name.slice(prefix.length)
      if (ASSET_FILE.test(path)) files.set(path, bytes)
    }
  }

  const rejectedTextures: string[] = []
  for (const [path, bytes] of files) {
    if (path.endsWith('.png') && !isAcceptablePng(bytes)) {
      files.delete(path)
      files.delete(`${path}.mcmeta`)
      rejectedTextures.push(path)
    }
  }

  return {
    info: { ...mcmeta.info, overlays, rejectedTextures: rejectedTextures.sort() },
    files,
    icon: entries.get(`${root}pack.png`) ?? null,
  }
}

/**
 * Folder holding `pack.mcmeta`: the archive root, or a single top-level
 * folder (packs zipped together with their folder). `null` if none.
 */
function findRoot(entries: Map<string, Uint8Array>): string | null {
  if (entries.has('pack.mcmeta')) return ''
  const nested = [...entries.keys()].filter((name) => /^[^/]+\/pack\.mcmeta$/.test(name))
  return nested.length === 1 ? nested[0].slice(0, -'pack.mcmeta'.length) : null
}

interface Overlay {
  directory: string
  range: FormatRange | null
}

function parseMcmeta(bytes: Uint8Array): {
  info: Omit<PackInfo, 'overlays' | 'rejectedTextures'>
  overlays: Overlay[]
} {
  let json: unknown
  try {
    json = JSON.parse(new TextDecoder().decode(bytes)) // TextDecoder drops a UTF-8 BOM
  } catch (error) {
    throw new AssetError('not-resource-pack', 'pack.mcmeta is not valid JSON', { cause: error })
  }
  const pack = field(json, 'pack')
  if (typeof pack !== 'object' || pack === null) {
    throw new AssetError('not-resource-pack', 'pack.mcmeta has no "pack" section')
  }
  const packFormat = majorOf(field(pack, 'pack_format'))
  const declared = formatRange(pack)
  const supported = declared ?? (packFormat !== null ? { min: packFormat, max: packFormat } : null)

  const entries = field(field(json, 'overlays'), 'entries')
  const overlays: Overlay[] = Array.isArray(entries)
    ? entries.flatMap((entry) => {
        const directory = field(entry, 'directory')
        if (typeof directory !== 'string' || !OVERLAY_DIR.test(directory)) return []
        return [{ directory, range: formatRange(entry) }]
      })
    : []

  return {
    info: { description: textOf(field(pack, 'description')), packFormat, supported },
    overlays,
  }
}

function applicableOverlays(overlays: Overlay[], gameFormat: number | null): string[] {
  if (gameFormat === null) return []
  return overlays
    .filter(({ range }) => range !== null && inRange(gameFormat, range))
    .map(({ directory }) => directory)
}

export function inRange(format: number, range: FormatRange): boolean {
  return format >= range.min && format <= range.max
}

/**
 * Format range of a pack or overlay entry, in any of the shapes Minecraft has
 * used: `supported_formats` / `formats` as a number, `[min, max]` or
 * `{ min_inclusive, max_inclusive }`; or `min_format` / `max_format` (1.21.9+),
 * each a number or `[major, minor]`.
 */
export function formatRange(entry: unknown): FormatRange | null {
  const min = majorOf(field(entry, 'min_format'))
  const max = majorOf(field(entry, 'max_format'))
  if (min !== null && max !== null) return { min: Math.min(min, max), max: Math.max(min, max) }

  const value = field(entry, 'supported_formats') ?? field(entry, 'formats')
  if (Number.isInteger(value)) return { min: value as number, max: value as number }
  if (Array.isArray(value) && value.length === 2 && value.every(Number.isInteger)) {
    const [a, b] = value as [number, number]
    return { min: Math.min(a, b), max: Math.max(a, b) }
  }
  const lo = field(value, 'min_inclusive')
  const hi = field(value, 'max_inclusive')
  if (Number.isInteger(lo) && Number.isInteger(hi)) {
    return { min: Math.min(lo as number, hi as number), max: Math.max(lo as number, hi as number) }
  }
  return null
}

/** A format number, or the major part of `[major, minor]`. */
function majorOf(value: unknown): number | null {
  if (Number.isInteger(value)) return value as number
  if (Array.isArray(value) && Number.isInteger(value[0])) return value[0] as number
  return null
}

/**
 * Checks the PNG signature and the size in its header before anything is
 * decoded, so an oversized image cannot exhaust memory when the atlas is built.
 */
export function isAcceptablePng(bytes: Uint8Array): boolean {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length < 24 || signature.some((b, i) => bytes[i] !== b)) return false
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // First chunk must be IHDR: width and height are its first two fields.
  if (view.getUint32(12) !== 0x49484452) return false
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  return (
    width > 0 && height > 0 && width <= MAX_TEXTURE_SIDE && width * height <= MAX_TEXTURE_PIXELS
  )
}

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.hasOwn(value, key)
      ? (value as Record<string, unknown>)[key]
      : undefined
    : undefined
}

export type PackCompatibility = 'compatible' | 'other-version' | 'unknown'

/** Whether a pack declares support for the loaded game's format. */
export function packCompatibility(
  supported: FormatRange | null,
  gameFormat: number | null,
): PackCompatibility {
  if (!supported || gameFormat === null) return 'unknown'
  return inRange(gameFormat, supported) ? 'compatible' : 'other-version'
}
