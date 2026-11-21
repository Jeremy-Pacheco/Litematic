/// <reference lib="webworker" />
import { toStructureReadError } from '../parsers/errors'
import { readStructureFile } from '../parsers/readStructureFile'
import type { WorkerRequest, WorkerResponse } from './protocol'

/**
 * Reads one structure file off the main thread.
 *
 * One worker is created per file and terminated afterwards (or on cancel), so
 * all memory used while reading is released with it.
 */

/** Minimum time between progress messages, to avoid flooding the main thread. */
const PROGRESS_INTERVAL_MS = 50

const scope = self as unknown as DedicatedWorkerGlobalScope

function post(message: WorkerResponse): void {
  scope.postMessage(message)
}

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  if (request.type !== 'read') return

  let lastProgress = 0
  try {
    const { info } = await readStructureFile(request.file, {
      maxBytes: request.maxBytes,
      onProgress: (progress) => {
        const now = performance.now()
        if (progress.fraction < 1 && now - lastProgress < PROGRESS_INTERVAL_MS) return
        lastProgress = now
        post({ type: 'progress', progress })
      },
    })
    post({ type: 'done', info })
  } catch (error) {
    const readError = toStructureReadError(error)
    post({ type: 'error', code: readError.code, message: readError.message })
  }
}
