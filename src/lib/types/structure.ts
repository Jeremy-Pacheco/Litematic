import type { StructureFormat } from '../constants/formats'
import type { NbtCompound } from './nbt'

/**
 * Format-independent structure model shared by every parser, the viewer,
 * the layer system and the material list.
 */

export interface Vec3 {
  x: number
  y: number
  z: number
}

/** A block id with its state properties, e.g. `minecraft:oak_stairs[facing=north]`. */
export interface BlockState {
  /** Namespaced id as stored in the file, e.g. `minecraft:stone`. */
  name: string
  /** Property values as strings. Own properties only (created with `Object.fromEntries`). */
  properties: Readonly<Record<string, string>>
}

export interface BlockEntity {
  /** Position inside the structure (0-based, same space as `blocks`). */
  pos: Vec3
  id: string
  /** Full NBT as stored in the file, detached from the file buffer. */
  nbt: NbtCompound
}

export interface Entity {
  /** Position inside the structure in blocks; fractional. */
  pos: Vec3
  id: string
  nbt: NbtCompound
}

/** A named sub-region (Litematica). Other formats have a single implicit region. */
export interface StructureRegion {
  name: string
  /** Minimum corner inside the structure. */
  min: Vec3
  size: Vec3
}

export interface StructureMetadata {
  name: string | null
  author: string | null
  description: string | null
  /** Milliseconds since the Unix epoch. */
  createdAt: number | null
  modifiedAt: number | null
}

/** Non-fatal problems found while parsing. */
export interface StructureWarnings {
  /** Blocks whose palette index did not exist; they were read as air. */
  invalidPaletteIndices: number
  /** Block names from before Minecraft 1.13 (the "flattening"), kept untranslated. */
  legacyBlockNames: boolean
  /** Regions that put different blocks in the same position (the last one wins). */
  overlappingBlocks: number
  /** Block entities or entities skipped because they had no usable position. */
  skippedObjects: number
  /** Pre-1.13 numeric ids with no known modern equivalent; read as air. */
  unknownLegacyBlocks: number
  /**
   * Converted from numeric ids: some skulls or banners had no block entity,
   * so their type or color is the default. (States derived from neighbors and
   * other block entity data are computed by the parser.)
   */
  approximateLegacyStates: boolean
}

export interface Structure {
  format: StructureFormat
  formatVersion: number | null
  dataVersion: number | null
  size: Vec3
  /** Global palette. Index 0 is always `minecraft:air`. */
  palette: BlockState[]
  /**
   * Palette index of every position, `(y * size.z + z) * size.x + x`.
   * `Uint16Array` unless the palette has more than 65 536 states.
   */
  blocks: Uint16Array | Uint32Array
  /** Positions that are not air. */
  nonAirBlocks: number
  /** How many positions use each palette state (same index as `palette`). */
  blockCounts: Uint32Array
  /** Non-air positions in each layer (index = y). */
  layerBlocks: Uint32Array
  blockEntities: BlockEntity[]
  entities: Entity[]
  regions: StructureRegion[]
  metadata: StructureMetadata
  warnings: StructureWarnings
}

/** Index of a position in `Structure.blocks`. */
export function blockIndex(size: Vec3, x: number, y: number, z: number): number {
  return (y * size.z + z) * size.x + x
}
