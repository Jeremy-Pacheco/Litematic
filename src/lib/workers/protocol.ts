import type { StructureErrorCode } from '../parsers/errors'
import type { ReadProgress, StructureFileInfo } from '../parsers/readStructureFile'

/** Messages from the main thread to the structure worker. */
export type WorkerRequest = { type: 'read'; file: File; maxBytes?: number }

/** Messages from the structure worker to the main thread. */
export type WorkerResponse =
  | { type: 'progress'; progress: ReadProgress }
  | { type: 'done'; info: StructureFileInfo }
  | { type: 'error'; code: StructureErrorCode; message: string }
