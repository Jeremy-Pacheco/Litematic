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

/** `[layer][group]`: groups 0–5 follow `FACES`, 6 is never culled. */
export type LayeredGeometry = (QuadGeometry | null)[][]

export interface BakedState {
  /**
   * The block's own model, without the fluid it holds (empty for water and
   * lava themselves).
   */
  geometry: LayeredGeometry
  /** Bit `i` set: side `FACES[i]` of the model is completely covered by an opaque face. */
  opaqueFaces: number
  /** Bit `i` set: side `FACES[i]` of the model is completely covered (any layer). */
  fullFaces: number
  /** No model was found: drawn with the missing texture. */
  missing: boolean
  /**
   * Drawn by Deepslate's special renderers because the game files have no
   * JSON model for it (signs before 26.x, chests…). Their geometry differs
   * from the game's, so what is placed on them (sign text) must know it.
   */
  specialModel: boolean
  /** Nothing to draw (air). */
  empty: boolean
  /**
   * Fluid that fills the position: `FLUID_NONE`, `FLUID_WATER` (water,
   * waterlogged blocks, kelp, seagrass, bubble columns) or `FLUID_LAVA`. Its
   * faces next to the same fluid are hidden, as in the game.
   */
  fluid: number
  /**
   * Height of that fluid on its own, as the game measures it (amount / 9:
   * 8/9 for a source, less for flowing fluid); 0 without fluid.
   */
  fluidHeight: number
  /**
   * How to draw that fluid, or `null` without fluid. Its shape depends on
   * the neighbours (sloped surface, flow direction), so the mesher builds it
   * block by block.
   */
  fluidRender: FluidRender | null
}

/** Textures and tint of a fluid, for the mesher. */
export interface FluidRender {
  /** Atlas rectangles [u0, v0, u1, v1] of the still and flowing textures. */
  still: [number, number, number, number]
  flow: [number, number, number, number]
  /** RGB tint (water is tinted, lava is not). */
  color: [number, number, number]
  /** Render layer of the fluid's texture. */
  layer: number
}

export const FLUID_NONE = 0
export const FLUID_WATER = 1
export const FLUID_LAVA = 2
