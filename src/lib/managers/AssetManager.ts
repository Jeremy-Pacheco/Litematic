import {
  clearAssets,
  loadAssetFiles,
  loadAssetsSummary,
  type AssetsMeta,
  type LangTable,
} from '../assets/assetCache'
import { AssetError } from '../assets/errors'
import type { AssetPhase, LoadedAssets } from '../assets/loadClientJar'
import type { AssetsWorkerRequest, AssetsWorkerResponse } from '../workers/assetsProtocol'

export interface AssetLoadTask {
  promise: Promise<LoadedAssets>
  cancel: () => void
}

/**
 * Single entry point to the game assets (textures, models, translations) for
 * the rest of the app. Assets come from the user's own client.jar and are
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
    const worker = new Worker(new URL('../workers/assets.worker.ts', import.meta.url), {
      type: 'module',
    })
    let settled = false
    let rejectTask: (error: AssetError) => void = () => {}

    const promise = new Promise<LoadedAssets>((resolve, reject) => {
      rejectTask = reject
      const finish = () => {
        settled = true
        worker.terminate()
      }
      worker.onmessage = (event: MessageEvent<AssetsWorkerResponse>) => {
        const message = event.data
        if (message.type === 'phase') onPhase?.(message.phase)
        else if (message.type === 'done') {
          finish()
          resolve({ meta: message.meta, lang: message.lang })
        } else {
          finish()
          reject(new AssetError(message.code, message.message))
        }
      }
      worker.onerror = (event: ErrorEvent) => {
        event.preventDefault()
        finish()
        reject(new AssetError('read-failed', event.message || 'Worker error'))
      }
      const request: AssetsWorkerRequest = { type: 'load-jar', file }
      worker.postMessage(request)
    })

    const cancel = () => {
      if (settled) return
      settled = true
      worker.terminate()
      rejectTask(new AssetError('cancelled', 'Loading was cancelled'))
    }
    return { promise, cancel }
  },

  remove(): Promise<void> {
    return clearAssets()
  },
}
