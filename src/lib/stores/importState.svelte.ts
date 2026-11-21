import type { StructureFormat } from '../constants/formats'

export interface SelectedStructureFile {
  file: File
  /** Format guessed from the file name; confirmed later by the parser. */
  format: StructureFormat
}

/** The structure file the user picked, shared by the top bar and the viewer. */
class ImportState {
  current = $state.raw<SelectedStructureFile | null>(null)

  select(file: File, format: StructureFormat): void {
    this.current = { file, format }
  }

  clear(): void {
    this.current = null
  }
}

export const importState = new ImportState()
