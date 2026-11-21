import type { StructureErrorCode } from '../parsers/errors'
import type { ReadProgress, StructureFileInfo } from '../parsers/readStructureFile'
import type { Structure } from '../types/structure'

/** Messages from the main thread to the structure worker. */
export type WorkerRequest = { type: 'read'; file: File; maxBytes?: number }

/** Result of reading one file, as delivered to the main thread. */
export interface StructureReadOutput {
  info: StructureFileInfo
  /** `null` when the blocks of this format cannot be parsed yet. */
  structure: Structure | null
}

/** Messages from the structure worker to the main thread. */
export type WorkerResponse =
  | { type: 'progress'; progress: ReadProgress }
  | ({ type: 'done' } & StructureReadOutput)
  | { type: 'error'; code: StructureErrorCode; message: string }
