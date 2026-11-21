import type { Vec3 } from '../types/structure'
import type { CapSide, LayerMesh, MesherState, SectionMesh } from '../viewer/mesher'

export type MesherRequest =
  | {
      type: 'mesh'
      size: Vec3
      /** The whole structure, or a slab of layers starting at `yStart`. */
      blocks: Uint16Array | Uint32Array
      yStart: number
      /** Section rows (along Y) this worker meshes: [from, to). */
      rows: { from: number; to: number }
      states: MesherState[]
    }
  /** Top or bottom faces of one level, for the layer system (after `mesh`). */
  | { type: 'cap'; y: number; side: CapSide }

export interface MesherStats {
  sections: number
  /** Quads per render layer (opaque, cutout, translucent). */
  quads: [number, number, number]
  durationMs: number
}

export type MesherResponse =
  | { type: 'section'; mesh: SectionMesh; done: number; total: number }
  | { type: 'done'; stats: MesherStats }
  | { type: 'cap'; y: number; side: CapSide; layers: (LayerMesh | null)[] }
  | { type: 'error'; message: string }
