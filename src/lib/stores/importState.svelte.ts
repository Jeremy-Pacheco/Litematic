import type { StructureFormat } from '../constants/formats'
import { toStructureReadError, type StructureErrorCode } from '../parsers/errors'
import type { ReadProgress, StructureFileInfo } from '../parsers/readStructureFile'
import type { Structure } from '../types/structure'
import { readStructureInWorker, type StructureReadTask } from '../workers/structureWorkerClient'

export interface SelectedStructureFile {
  file: File
  /** Format guessed from the file name. The content decides in the end. */
  formatHint: StructureFormat
}

export type ImportStatus =
  | { kind: 'idle' }
  | { kind: 'reading'; progress: ReadProgress }
  | { kind: 'ready'; info: StructureFileInfo; structure: Structure | null }
  | { kind: 'error'; code: StructureErrorCode; message: string }

export type LoadOutcome =
  | { kind: 'ready'; info: StructureFileInfo; structure: Structure | null }
  | { kind: 'error'; code: StructureErrorCode; message: string }
  /** Replaced by a newer load before finishing; the caller should do nothing. */
  | { kind: 'superseded' }

/**
 * The structure file the user picked and the state of reading it.
 *
 * Starting a new load cancels the previous one, which terminates its worker
 * and releases the memory it used. The previous structure is dropped as soon
 * as the new load starts, so both never stay in memory together.
 */
class ImportState {
  current = $state.raw<SelectedStructureFile | null>(null)
  status = $state.raw<ImportStatus>({ kind: 'idle' })

  #task: StructureReadTask | null = null
  #generation = 0

  async load(file: File, formatHint: StructureFormat): Promise<LoadOutcome> {
    this.#task?.cancel()
    const generation = ++this.#generation

    this.current = { file, formatHint }
    this.status = { kind: 'reading', progress: { phase: 'decompressing', fraction: 0 } }

    const task = readStructureInWorker(file, (progress) => {
      if (generation === this.#generation) this.status = { kind: 'reading', progress }
    })
    this.#task = task

    try {
      const { info, structure } = await task.promise
      if (generation !== this.#generation) return { kind: 'superseded' }
      this.status = { kind: 'ready', info, structure }
      return { kind: 'ready', info, structure }
    } catch (error) {
      if (generation !== this.#generation) return { kind: 'superseded' }
      const { code, message } = toStructureReadError(error)
      this.current = null
      this.status = { kind: 'error', code, message }
      return { kind: 'error', code, message }
    } finally {
      if (this.#task === task) this.#task = null
    }
  }

  /** Cancels the read in progress, if any. Its `load()` resolves with `cancelled`. */
  cancel(): void {
    this.#task?.cancel()
  }

  clear(): void {
    this.cancel()
    this.#generation++
    this.current = null
    this.status = { kind: 'idle' }
  }
}

export const importState = new ImportState()
