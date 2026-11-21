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

/** The structure on screen, with the file it came from. */
export interface ShownStructure {
  file: File
  info: StructureFileInfo
  structure: Structure
}

/**
 * The structure file the user picked and the state of reading it.
 *
 * Starting a new load cancels the previous read, which terminates its worker
 * and releases the memory it used. The structure on screen (`shown`) stays
 * until the new one is ready, so the user never loses the view: if the new
 * file fails, the previous structure is still there. While a file is read,
 * both can be in memory for a moment.
 */
class ImportState {
  /** File being read or shown (for the top bar). */
  current = $state.raw<SelectedStructureFile | null>(null)
  status = $state.raw<ImportStatus>({ kind: 'idle' })
  shown = $state.raw<ShownStructure | null>(null)
  #shownSelection: SelectedStructureFile | null = null

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
      if (structure) {
        this.shown = { file, info, structure }
        this.#shownSelection = this.current
      }
      return { kind: 'ready', info, structure }
    } catch (error) {
      if (generation !== this.#generation) return { kind: 'superseded' }
      const { code, message } = toStructureReadError(error)
      // Back to the structure on screen, if there is one.
      this.current = this.#shownSelection
      this.status = this.shown
        ? { kind: 'ready', info: this.shown.info, structure: this.shown.structure }
        : { kind: 'error', code, message }
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
    this.shown = null
    this.#shownSelection = null
  }
}

export const importState = new ImportState()
