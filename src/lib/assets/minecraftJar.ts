import { AssetError } from './errors'
import { readZip, type ZipLimits } from './zipReader'

/**
 * Reads the parts of a Minecraft Java `client.jar` the viewer needs.
 *
 * Only these entries are extracted (≈ 7 300 files, ≈ 4 MB for 26.3):
 * - `version.json`
 * - `assets/minecraft/blockstates/*.json`
 * - `assets/minecraft/models/{block,item}/**.json`
 * - `assets/minecraft/items/*.json` (item model definitions, 1.21.4+)
 * - `assets/minecraft/textures/{block,item,entity,colormap,font}/**.{png,mcmeta}`
 * - `assets/minecraft/font/**.json` (font definitions, for sign text)
 * - `assets/minecraft/lang/en_us.json` (the only language inside the jar)
 */

const WANTED = [
  /^assets\/minecraft\/blockstates\/[^/]+\.json$/,
  /^assets\/minecraft\/models\/(block|item)\/.+\.json$/,
  /^assets\/minecraft\/items\/[^/]+\.json$/,
  /^assets\/minecraft\/textures\/(block|item|entity|colormap|font)\/.+\.(png|mcmeta)$/,
  /^assets\/minecraft\/font\/.+\.json$/,
  /^assets\/minecraft\/lang\/en_us\.json$/,
]

export const VERSION_FILE = 'version.json'
export const LANG_FILE = 'assets/minecraft/lang/en_us.json'
const BLOCKSTATES_PREFIX = 'assets/minecraft/blockstates/'

export function isWantedJarEntry(name: string): boolean {
  return name === VERSION_FILE || WANTED.some((pattern) => pattern.test(name))
}

export interface GameVersion {
  /** Version name, e.g. `26.3`. */
  id: string
  /** Data version of the game (comparable with a structure's DataVersion). */
  dataVersion: number
  /** Resource pack format, e.g. 97. */
  resourcePackFormat: number | null
  stable: boolean
}

export interface GameAssets {
  version: GameVersion
  /** Extracted files by path inside the jar. */
  files: Map<string, Uint8Array>
}

/**
 * @throws {AssetError} `not-client-jar` when the archive is a valid ZIP but
 * not a client jar (e.g. the server jar, which has no assets).
 */
export function readClientJar(data: Uint8Array, limits?: Partial<ZipLimits>): GameAssets {
  const files = readZip(data, { accept: isWantedJarEntry, limits })

  const versionFile = files.get(VERSION_FILE)
  const hasBlockstates = [...files.keys()].some((name) => name.startsWith(BLOCKSTATES_PREFIX))
  if (!versionFile || !hasBlockstates || !files.has(LANG_FILE)) {
    throw new AssetError(
      'not-client-jar',
      'The archive has no version.json, block states or language file',
    )
  }
  return { version: parseVersion(versionFile), files }
}

function parseVersion(bytes: Uint8Array): GameVersion {
  let json: unknown
  try {
    json = JSON.parse(new TextDecoder().decode(bytes))
  } catch (error) {
    throw new AssetError('not-client-jar', 'version.json is not valid JSON', { cause: error })
  }
  const v = json as {
    id?: unknown
    world_version?: unknown
    stable?: unknown
    pack_version?: unknown
  }
  if (typeof v.id !== 'string' || !Number.isInteger(v.world_version)) {
    throw new AssetError('not-client-jar', 'version.json has no id or world_version')
  }
  return {
    id: v.id,
    dataVersion: v.world_version as number,
    resourcePackFormat: readPackFormat(v.pack_version),
    stable: v.stable !== false,
  }
}

/** `pack_version` is `{ resource_major, … }` in recent versions, `{ resource }` or a number before. */
function readPackFormat(value: unknown): number | null {
  if (Number.isInteger(value)) return value as number
  if (typeof value !== 'object' || value === null) return null
  const v = value as { resource_major?: unknown; resource?: unknown }
  if (Number.isInteger(v.resource_major)) return v.resource_major as number
  if (Number.isInteger(v.resource)) return v.resource as number
  return null
}
