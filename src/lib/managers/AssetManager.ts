import {
  clearAssets,
  clearPack,
  loadAssetFiles,
  loadAssetsSummary,
  loadPackMeta,
  type AssetsMeta,
  type LangTable,
  type PackMeta,
} from '../assets/assetCache'
import { AssetError } from '../assets/errors'
import type { AssetPhase, LoadedAssets } from '../assets/loadClientJar'
import type { AssetsWorkerRequest, AssetsWorkerResponse } from '../workers/assetsProtocol'

export interface AssetTask<T> {
  promise: Promise<T>
  cancel: () => void
}

export type AssetLoadTask = AssetTask<LoadedAssets>

/**
 * Single entry point to the game assets (textures, models, translations) and
 * the user's resource pack. Both come from the user's own files and are
 * cached in IndexedDB; they are never bundled or uploaded.
 */
export const AssetManager = {
  /** Cached version and translations, or `null` if none were loaded yet. */
  loadCached(): Promise<{ meta: AssetsMeta; lang: LangTable } | null> {
    return loadAssetsSummary()
  },

  /** All cached files by path (for the renderer). */
  loadFiles(): Promise<Map<string, Uint8Array> | null> {
    return loadAssetFiles()
  },

  /** Extracts and caches a client jar in a dedicated worker. */
  importJar(file: File, onPhase?: (phase: AssetPhase) => void): AssetLoadTask {
    return runWorker({ type: 'load-jar', file }, onPhase, (message) =>
      message.type === 'done' ? { meta: message.meta, lang: message.lang } : undefined,
    )
  },

  remove(): Promise<void> {
    return clearAssets()
  },

  /** The cached resource pack, or `null`. */
  loadPack(): Promise<PackMeta | null> {
    return loadPackMeta()
  },

  /**
   * Extracts and caches a resource pack (replacing the previous one).
   * `gameFormat` selects the pack overlays that apply to the loaded game.
   */
  importPack(
    file: File,
    gameFormat: number | null,
    onPhase?: (phase: AssetPhase) => void,
  ): AssetTask<PackMeta> {
    return runWorker({ type: 'load-pack', file, gameFormat }, onPhase, (message) =>
      message.type === 'pack-done' ? message.meta : undefined,
    )
  },

  removePack(): Promise<void> {
    return clearPack()
  },
}

/**
 * Runs one request in a new assets worker, terminated when it ends or is
 * cancelled. `result` extracts the value from the success message.
 */
function runWorker<T>(
  request: AssetsWorkerRequest,
  onPhase: ((phase: AssetPhase) => void) | undefined,
  result: (message: AssetsWorkerResponse) => T | undefined,
): AssetTask<T> {
  const worker = new Worker(new URL('../workers/assets.worker.ts', import.meta.url), {
    type: 'module',
  })
  let settled = false
  let rejectTask: (error: AssetError) => void = () => {}

  const promise = new Promise<T>((resolve, reject) => {
    rejectTask = reject
    const finish = () => {
      settled = true
      worker.terminate()
    }
    worker.onmessage = (event: MessageEvent<AssetsWorkerResponse>) => {
      const message = event.data
      if (message.type === 'phase') {
        onPhase?.(message.phase)
        return
      }
      finish()
      if (message.type === 'error') {
        reject(new AssetError(message.code, message.message))
        return
      }
      const value = result(message)
      if (value === undefined) reject(new AssetError('read-failed', 'Unexpected worker reply'))
      else resolve(value)
    }
    worker.onerror = (event: ErrorEvent) => {
      event.preventDefault()
      finish()
      reject(new AssetError('read-failed', event.message || 'Worker error'))
    }
    worker.postMessage(request)
  })

  const cancel = () => {
    if (settled) return
    settled = true
    worker.terminate()
    rejectTask(new AssetError('cancelled', 'Loading was cancelled'))
  }
  return { promise, cancel }
}
