import { saveAssets, type AssetsMeta, type LangTable } from './assetCache'
import { AssetError } from './errors'
import { LANG_FILE, readClientJar } from './minecraftJar'

export type AssetPhase = 'reading' | 'extracting' | 'saving'

export interface LoadedAssets {
  meta: AssetsMeta
  lang: LangTable
  /**
   * The extracted files when the browser refused to store them (private
   * mode, Brave shields, blocked site data…): the app keeps them in memory
   * for the session instead. `null` when they were cached as usual.
   */
  memoryFiles: Map<string, Uint8Array> | null
}

/**
 * Full pipeline for a selected jar: read → extract safely → cache. Runs in the
 * assets worker; kept free of worker APIs so it can be tested. If the cache
 * cannot be written, the files are returned to be used from memory.
 */
export async function loadClientJar(
  file: Blob,
  onPhase?: (phase: AssetPhase) => void,
): Promise<LoadedAssets> {
  onPhase?.('reading')
  const data = new Uint8Array(await file.arrayBuffer())

  onPhase?.('extracting')
  const { version, files } = readClientJar(data)
  const lang = parseLang(files.get(LANG_FILE)!)

  let bytes = 0
  for (const content of files.values()) bytes += content.byteLength
  const meta: AssetsMeta = { version, fileCount: files.size, bytes, savedAt: Date.now() }

  onPhase?.('saving')
  const stored = await storeOrKeep(() => saveAssets(meta, lang, files))
  return { meta, lang, memoryFiles: stored ? null : files }
}

/**
 * Runs a cache write. `false` when the browser does not let the app store
 * data (`storage-failed`): the caller keeps the data in memory instead. Other
 * errors are rethrown.
 */
export async function storeOrKeep(save: () => Promise<void>): Promise<boolean> {
  try {
    await save()
    return true
  } catch (error) {
    if (error instanceof AssetError && error.code === 'storage-failed') return false
    throw error
  }
}

/** Keeps only string values; anything else in the file is ignored. */
export function parseLang(bytes: Uint8Array): LangTable {
  let json: unknown
  try {
    json = JSON.parse(new TextDecoder().decode(bytes))
  } catch (error) {
    throw new AssetError('not-client-jar', 'The language file is not valid JSON', { cause: error })
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new AssetError('not-client-jar', 'The language file is not a JSON object')
  }
  const table: Record<string, string> = {}
  for (const [key, value] of Object.entries(json)) {
    if (typeof value === 'string') table[key] = value
  }
  return table
}
