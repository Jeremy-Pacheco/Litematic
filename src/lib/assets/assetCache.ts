import { AssetError } from './errors'
import type { GameVersion } from './minecraftJar'

/**
 * IndexedDB cache of the extracted game assets, so the user selects the jar
 * only once. Data never leaves the browser.
 *
 * Three records, read independently:
 * - `vanilla:meta`  — version and sizes (tiny, read at startup)
 * - `vanilla:lang`  — en_us translations (≈ 0.5 MB, read at startup)
 * - `vanilla:files` — every extracted file (≈ 4 MB, read only by the
 *   renderer once it exists)
 */

const DB_NAME = 'litematicviewer'
const DB_VERSION = 1
const STORE = 'assets'
const KEYS = {
  meta: 'vanilla:meta',
  lang: 'vanilla:lang',
  files: 'vanilla:files',
} as const

export interface AssetsMeta {
  version: GameVersion
  fileCount: number
  /** Total size of the extracted files. */
  bytes: number
  /** When they were extracted (ms since epoch). */
  savedAt: number
}

export type LangTable = Readonly<Record<string, string>>

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch (error) {
      reject(storageError(error))
      return
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(storageError(request.error))
    request.onblocked = () => reject(new AssetError('storage-failed', 'IndexedDB is blocked'))
  })
}

/** Runs one transaction and resolves with the value of the last request. */
async function run<T>(
  mode: IDBTransactionMode,
  body: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openDb()
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const request = body(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(request ? request.result : undefined)
      tx.onerror = () => reject(storageError(tx.error))
      tx.onabort = () => reject(storageError(tx.error))
    })
  } finally {
    db.close()
  }
}

export async function saveAssets(
  meta: AssetsMeta,
  lang: LangTable,
  files: Map<string, Uint8Array>,
): Promise<void> {
  await run('readwrite', (store) => {
    store.put(meta, KEYS.meta)
    store.put(lang, KEYS.lang)
    store.put(files, KEYS.files)
  })
}

/** Metadata and translations, or `null` when nothing is cached. */
export async function loadAssetsSummary(): Promise<{ meta: AssetsMeta; lang: LangTable } | null> {
  const meta = await run<AssetsMeta>('readonly', (store) => store.get(KEYS.meta))
  if (!meta) return null
  const lang = await run<LangTable>('readonly', (store) => store.get(KEYS.lang))
  return lang ? { meta, lang } : null
}

/** Every extracted file, or `null` when nothing is cached. */
export async function loadAssetFiles(): Promise<Map<string, Uint8Array> | null> {
  return (await run<Map<string, Uint8Array>>('readonly', (store) => store.get(KEYS.files))) ?? null
}

export async function clearAssets(): Promise<void> {
  await run('readwrite', (store) => {
    store.delete(KEYS.meta)
    store.delete(KEYS.lang)
    store.delete(KEYS.files)
  })
}

function storageError(cause: unknown): AssetError {
  const message = cause instanceof Error ? cause.message : 'IndexedDB is not available'
  return new AssetError('storage-failed', message, { cause })
}
