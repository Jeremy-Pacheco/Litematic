/**
 * Shapes and constants of baked block models, without any dependency on
 * Deepslate, so lightweight code (the mesher worker) can use them without
 * bundling the model resolver.
 */

/** Sides in group order. Group 6 holds faces that are never culled. */
export const FACES = ['up', 'down', 'north', 'south', 'east', 'west'] as const
export type Face = (typeof FACES)[number]
export const INNER_GROUP = 6
export const GROUP_COUNT = 7

/** Texture id used for blocks without a model or with a missing texture. */
export const MISSING_TEXTURE = 'litematicviewer:missing'

/** Flat vertex data of a group of quads (4 vertices per quad). */
export interface QuadGeometry {
  quadCount: number
  /** xyz per vertex, block space 0–1. */
  positions: Float32Array
  /** uv per vertex, normalized atlas coordinates (v pointing down). */
  uvs: Float32Array
  /** rgb tint per vertex (1,1,1 when untinted). */
  colors: Float32Array
  /** xyz normal per vertex. */
  normals: Float32Array
}

export interface BakedState {
  /** `geometry[layer][group]`: groups 0–5 follow `FACES`, 6 is never culled. */
  geometry: (QuadGeometry | null)[][]
  /** Bit `i` set: side `FACES[i]` is completely covered by an opaque face. */
  opaqueFaces: number
  /** Bit `i` set: side `FACES[i]` is completely covered (any layer). */
  fullFaces: number
  /** No model was found: drawn with the missing texture. */
  missing: boolean
  /** Nothing to draw (air). */
  empty: boolean
}
