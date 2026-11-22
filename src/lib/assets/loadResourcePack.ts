import { savePack, type PackMeta } from './assetCache'
import { readResourcePack } from './resourcePack'
import { storeOrKeep, type AssetPhase } from './loadClientJar'

export interface LoadedPack {
  meta: PackMeta
  /** The pack's files when the browser refused to store them (see `LoadedAssets`). */
  memoryFiles: Map<string, Uint8Array> | null
}

/**
 * Full pipeline for a selected resource pack: read → extract safely → cache.
 * Runs in the assets worker; kept free of worker APIs so it can be tested. If
 * the cache cannot be written, the files are returned to be used from memory.
 *
 * @param gameFormat resource pack format of the loaded game, to choose the
 * pack's overlays (`null` if unknown: only the base files are used).
 */
export async function loadResourcePack(
  file: Blob & { name?: string },
  gameFormat: number | null,
  onPhase?: (phase: AssetPhase) => void,
): Promise<LoadedPack> {
  onPhase?.('reading')
  const data = new Uint8Array(await file.arrayBuffer())

  onPhase?.('extracting')
  const { info, files, icon } = readResourcePack(data, gameFormat)

  let bytes = 0
  for (const content of files.values()) bytes += content.byteLength
  const meta: PackMeta = {
    ...info,
    name: file.name ?? 'resource-pack.zip',
    fileCount: files.size,
    bytes,
    icon,
    savedAt: Date.now(),
  }

  onPhase?.('saving')
  const stored = await storeOrKeep(() => savePack(meta, files))
  return { meta, memoryFiles: stored ? null : files }
}
