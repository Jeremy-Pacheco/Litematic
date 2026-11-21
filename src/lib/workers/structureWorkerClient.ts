import { StructureReadError } from '../parsers/errors'
import type { ReadProgress } from '../parsers/readStructureFile'
import type { StructureReadOutput, WorkerRequest, WorkerResponse } from './protocol'

export interface StructureReadTask {
  promise: Promise<StructureReadOutput>
  /** Stops reading immediately and frees the worker's memory. */
  cancel: () => void
}

/**
 * Starts reading `file` in a dedicated worker.
 * The promise rejects with a `StructureReadError` (code `cancelled` on cancel).
 */
export function readStructureInWorker(
  file: File,
  onProgress?: (progress: ReadProgress) => void,
): StructureReadTask {
  const worker = new Worker(new URL('./structure.worker.ts', import.meta.url), {
    type: 'module',
  })

  let settled = false
  let rejectTask: (error: StructureReadError) => void = () => {}

  const promise = new Promise<StructureReadOutput>((resolve, reject) => {
    rejectTask = reject

    const finish = () => {
      settled = true
      worker.terminate()
    }

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      if (message.type === 'progress') {
        onProgress?.(message.progress)
      } else if (message.type === 'done') {
        finish()
        resolve({ info: message.info, structure: message.structure })
      } else {
        finish()
        reject(new StructureReadError(message.code, message.message))
      }
    }

    // Uncaught errors inside the worker, including failing to load it.
    worker.onerror = (event: ErrorEvent) => {
      event.preventDefault()
      finish()
      reject(new StructureReadError('read-failed', event.message || 'Worker error'))
    }

    const request: WorkerRequest = { type: 'read', file }
    worker.postMessage(request)
  })

  const cancel = () => {
    if (settled) return
    settled = true
    worker.terminate()
    rejectTask(new StructureReadError('cancelled', 'Reading was cancelled'))
  }

  return { promise, cancel }
}
