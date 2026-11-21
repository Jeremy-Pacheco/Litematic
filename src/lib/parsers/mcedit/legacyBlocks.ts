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

export function createLegacyTable(blocks: Readonly<Record<string, string>>): LegacyBlockTable {
  const cache = new Map<number, BlockState | null>()

  const lookup = (id: number, meta: number): BlockState | null => {
    const text = blocks[`${id}:${meta}`]
    return text === undefined ? null : parseBlockStateString(text)
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
