/// <reference lib="webworker" />
import { loadAssetFiles, loadPackFiles } from '../assets/assetCache'
import { applyBiome } from '../models/applyBiome'
import { bakeModels, bakedTransferables } from '../models/bakeModels'
import type { ModelsWorkerRequest, ModelsWorkerResponse } from './modelsProtocol'

/**
 * Bakes block models and the texture atlas for a palette, off the main
 * thread. Game files are read from IndexedDB here, so the assets are never
 * copied through the main thread. The user's resource pack, if any, is laid
 * over the game files: what the pack lacks keeps the game's version.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope

scope.onmessage = async (event: MessageEvent<ModelsWorkerRequest>) => {
  if (event.data.type !== 'bake') return
  try {
    const files = await loadAssetFiles()
    if (!files) {
      const message: ModelsWorkerResponse = {
        type: 'error',
        code: 'no-assets',
        message: 'No game assets loaded',
      }
      scope.postMessage(message)
      return
    }
    const pack = await loadPackFiles()
    const merged = pack ? overlay(files, pack) : files
    await applyBiome(event.data.biome, merged)
    const models = await bakeModels(event.data.palette, merged, event.data.data)
    const message: ModelsWorkerResponse = { type: 'done', models }
    scope.postMessage(message, bakedTransferables(models))
  } catch (error) {
    const message: ModelsWorkerResponse = {
      type: 'error',
      code: 'bake-failed',
      message: error instanceof Error ? error.message : String(error),
    }
    scope.postMessage(message)
  }
}

/** Game files with the pack's files replacing those with the same path. */
function overlay(
  base: Map<string, Uint8Array>,
  top: Map<string, Uint8Array>,
): Map<string, Uint8Array> {
  const merged = new Map(base)
  for (const [path, bytes] of top) merged.set(path, bytes)
  return merged
}
