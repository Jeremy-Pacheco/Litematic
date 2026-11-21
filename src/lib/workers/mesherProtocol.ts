import type { Vec3 } from '../types/structure'
import type { MesherState, SectionMesh } from '../viewer/mesher'

export type MesherRequest = {
  type: 'mesh'
  size: Vec3
  blocks: Uint16Array | Uint32Array
  states: MesherState[]
}

export interface MesherStats {
  sections: number
  /** Quads per render layer (opaque, cutout, translucent). */
  quads: [number, number, number]
  durationMs: number
}

export type MesherResponse =
  | { type: 'section'; mesh: SectionMesh; done: number; total: number }
  | { type: 'done'; stats: MesherStats }
  | { type: 'error'; message: string }
