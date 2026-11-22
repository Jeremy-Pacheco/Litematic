/// <reference lib="webworker" />
import { loadAssetFiles, loadPackFiles } from '../assets/assetCache'
import { resolveGameFiles } from '../assets/assetSource'
import { bakeModels, bakedTransferables } from '../models/bakeModels'
import type { ModelsWorkerRequest, ModelsWorkerResponse } from './modelsProtocol'

/**
 * Bakes block models and the texture atlas for a palette, off the main
 * thread. Game files are read from IndexedDB here, so the assets are not
 * copied through the main thread, unless the page sends them because the
 * browser refused to store them (see `resolveGameFiles`).
 */
const scope = self as unknown as DedicatedWorkerGlobalScope

scope.onmessage = async (event: MessageEvent<ModelsWorkerRequest>) => {
  if (event.data.type !== 'bake') return
  try {
    const files = await resolveGameFiles({
      memory: event.data.memory,
      cache: { files: loadAssetFiles, pack: loadPackFiles },
    })
    if (!files) {
      const message: ModelsWorkerResponse = {
        type: 'error',
        code: 'no-assets',
        message: 'No game assets loaded',
      }
      scope.postMessage(message)
      return
    }
    const models = await bakeModels(event.data.palette, files, event.data.data)
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
