/**
 * Where the models worker takes the game files from: the ones the page kept
 * in memory (the browser refused to store them), or else the IndexedDB
 * cache. The resource pack, if any, is laid over the game files: what the
 * pack lacks keeps the game's version.
 */

export type FileMap = Map<string, Uint8Array>

export interface AssetSources {
  /** Kept in memory by the page this session, if any. */
  memory: { files: FileMap | null; pack: FileMap | null }
  /** Readers of the IndexedDB cache. */
  cache: { files: () => Promise<FileMap | null>; pack: () => Promise<FileMap | null> }
}

/** The game files with the pack over them, or `null` when no game files are loaded. */
export async function resolveGameFiles({ memory, cache }: AssetSources): Promise<FileMap | null> {
  const files = memory.files ?? (await cache.files())
  if (!files) return null
  // With storage blocked, reading the cached pack would fail: no pack then.
  const pack = memory.pack ?? (await cache.pack().catch(() => null))
  return pack ? overlay(files, pack) : files
}

/** Game files with the pack's files replacing those with the same path. */
function overlay(base: FileMap, top: FileMap): FileMap {
  const merged = new Map(base)
  for (const [path, bytes] of top) merged.set(path, bytes)
  return merged
}
