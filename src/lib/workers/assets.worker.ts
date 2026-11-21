/// <reference lib="webworker" />
import { toAssetError } from '../assets/errors'
import { loadClientJar, type AssetPhase } from '../assets/loadClientJar'
import { loadResourcePack } from '../assets/loadResourcePack'
import type { AssetsWorkerRequest, AssetsWorkerResponse } from './assetsProtocol'

/**
 * Extracts and caches a client jar or a resource pack off the main thread.
 * One worker per archive, terminated afterwards, so the archive is released.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope

function post(message: AssetsWorkerResponse): void {
  scope.postMessage(message)
}

scope.onmessage = async (event: MessageEvent<AssetsWorkerRequest>) => {
  const request = event.data
  const onPhase = (phase: AssetPhase) => post({ type: 'phase', phase })
  try {
    if (request.type === 'load-jar') {
      post({ type: 'done', ...(await loadClientJar(request.file, onPhase)) })
    } else if (request.type === 'load-pack') {
      const meta = await loadResourcePack(request.file, request.gameFormat, onPhase)
      post({ type: 'pack-done', meta })
    }
  } catch (error) {
    const assetError = toAssetError(error)
    post({ type: 'error', code: assetError.code, message: assetError.message })
  }
}
