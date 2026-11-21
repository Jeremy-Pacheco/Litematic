import type { BlockState } from '../../types/structure'
import { parseBlockStateString } from '../blockStateString'

/**
 * Translation of pre-1.13 numeric block ids (`id:meta`) to flattened block
 * states, backed by the table in `data/legacyBlocks.json`
 * (PrismarineJS/minecraft-data, MIT; see `data/LICENSE-minecraft-data.txt`).
 */
export interface LegacyBlockTable {
  /**
   * Block state for `id:meta`. Falls back to `id:0` (the default variant) when
   * that exact metadata is not listed. Returns `null` for unknown ids.
   */
  resolve(id: number, meta: number): BlockState | null
}

/**
 * The table gives 1.13 ids. These were renamed later, and the current game
 * resources only have the new names. `stone_slab` is a change of meaning:
 * in 1.13 it was the smooth stone slab; since 1.14 that is
 * `smooth_stone_slab`, and `stone_slab` is a plain stone slab.
 */
export const LEGACY_RENAMES: Readonly<Record<string, string>> = {
  'minecraft:sign': 'minecraft:oak_sign', // 1.14
  'minecraft:wall_sign': 'minecraft:oak_wall_sign', // 1.14
  'minecraft:stone_slab': 'minecraft:smooth_stone_slab', // 1.14
  'minecraft:grass_path': 'minecraft:dirt_path', // 1.17
  'minecraft:grass': 'minecraft:short_grass', // 1.20.3
}

export function createLegacyTable(blocks: Readonly<Record<string, string>>): LegacyBlockTable {
  const cache = new Map<number, BlockState | null>()

  const lookup = (id: number, meta: number): BlockState | null => {
    const text = blocks[`${id}:${meta}`]
    const state = text === undefined ? null : parseBlockStateString(text)
    const renamed =
      state && Object.hasOwn(LEGACY_RENAMES, state.name) ? LEGACY_RENAMES[state.name] : undefined
    return state && renamed ? { name: renamed, properties: state.properties } : state
  }

  return {
    resolve(id, meta) {
      const key = id * 16 + meta
      let state = cache.get(key)
      if (state === undefined) {
        state = lookup(id, meta) ?? (meta !== 0 ? lookup(id, 0) : null)
        cache.set(key, state)
      }
      return state
    },
  }
}

/**
 * Loads the table on demand. It is a separate chunk (~100 KB), so it is only
 * downloaded when an MCEdit schematic is opened.
 */
export async function loadLegacyBlocks(): Promise<LegacyBlockTable> {
  const { default: data } = await import('../../data/legacyBlocks.json')
  return createLegacyTable(data.blocks)
}
