import type {
  BlockEntity,
  BlockState,
  Entity,
  Structure,
  StructureMetadata,
  StructureRegion,
  StructureWarnings,
  Vec3,
} from '../types/structure'
import { AIR, blockStateKey, isAirId } from './blockState'
import { StructureReadError } from './errors'

/**
 * Largest structure accepted, in positions (512 Mi). At 2 bytes per position
 * this is 1 GiB for the block array alone; beyond that a browser tab is likely
 * to run out of memory.
 */
export const MAX_STRUCTURE_VOLUME = 512 * 1024 * 1024

/** Checks a structure size before anything is allocated for it. */
export function assertStructureSize(size: Vec3, maxVolume = MAX_STRUCTURE_VOLUME): void {
  const { x, y, z } = size
  if (![x, y, z].every((v) => Number.isInteger(v) && v > 0)) {
    throw new StructureReadError('invalid-structure', `Invalid structure size ${x}×${y}×${z}`)
  }
  if (x * y * z > maxVolume) {
    throw new StructureReadError(
      'structure-too-large',
      `Structure of ${x}×${y}×${z} exceeds ${maxVolume} blocks`,
    )
  }
}

/**
 * Global palette shared by all regions. Index 0 is air, and every air variant
 * (`cave_air`, `void_air`) maps to it.
 */
export class PaletteBuilder {
  readonly states: BlockState[] = [AIR]
  readonly #indexByKey = new Map<string, number>([[blockStateKey(AIR), 0]])

  /** Returns the global index of `state`, adding it if new. */
  add(state: BlockState): number {
    if (isAirId(state.name)) return 0
    const key = blockStateKey(state)
    let index = this.#indexByKey.get(key)
    if (index === undefined) {
      index = this.states.length
      this.states.push(state)
      this.#indexByKey.set(key, index)
    }
    return index
  }
}

export interface StructureParts {
  format: Structure['format']
  formatVersion: number | null
  dataVersion: number | null
  size: Vec3
  palette: BlockState[]
  blocks: Uint16Array | Uint32Array
  blockEntities: BlockEntity[]
  entities: Entity[]
  regions: StructureRegion[]
  metadata: StructureMetadata
  warnings: StructureWarnings
}

/** Allocates the block array with the narrowest type that fits the palette. */
export function allocateBlocks(size: Vec3, paletteSize: number): Uint16Array | Uint32Array {
  const volume = size.x * size.y * size.z
  return paletteSize <= 0x10000 ? new Uint16Array(volume) : new Uint32Array(volume)
}

/** Finishes a structure, counting the positions that are not air. */
export function finishStructure(parts: StructureParts): Structure {
  let nonAir = 0
  const { blocks } = parts
  for (let i = 0; i < blocks.length; i++) if (blocks[i] !== 0) nonAir++
  return { ...parts, nonAirBlocks: nonAir }
}

export function emptyWarnings(): StructureWarnings {
  return {
    invalidPaletteIndices: 0,
    legacyBlockNames: false,
    overlappingBlocks: 0,
    skippedObjects: 0,
  }
}
