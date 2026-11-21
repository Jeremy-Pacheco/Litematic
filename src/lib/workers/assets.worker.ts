/// <reference lib="webworker" />
import { toAssetError } from '../assets/errors'
import { loadClientJar } from '../assets/loadClientJar'
import type { AssetsWorkerRequest, AssetsWorkerResponse } from './assetsProtocol'

/**
 * Extracts and caches the assets of a client jar off the main thread. One
 * worker per jar, terminated afterwards, so the 40 MB archive is released.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope

function post(message: AssetsWorkerResponse): void {
  scope.postMessage(message)
}

scope.onmessage = async (event: MessageEvent<AssetsWorkerRequest>) => {
  if (event.data.type !== 'load-jar') return
  try {
    const result = await loadClientJar(event.data.file, (phase) => post({ type: 'phase', phase }))
    post({ type: 'done', ...result })
  } catch (error) {
    const assetError = toAssetError(error)
    post({ type: 'error', code: assetError.code, message: assetError.message })
  }
}
