import { describe, expect, it } from 'vitest'
import legacy from '../../../src/lib/data/legacyBlocks.json'
import { blockStateKey } from '../../../src/lib/parsers/blockState'
import { parseBlockStateString } from '../../../src/lib/parsers/blockStateString'
import { createLegacyTable, loadLegacyBlocks } from '../../../src/lib/parsers/mcedit/legacyBlocks'

describe('legacyBlocks.json', () => {
  it('records its source', () => {
    expect(legacy.source).toContain('PrismarineJS/minecraft-data@11fed0c')
    expect(legacy.source).toContain('MIT')
  })

  it('contains every entry of the source and all of them are valid block states', () => {
    const entries = Object.entries(legacy.blocks)
    expect(entries).toHaveLength(1682)
    for (const [key, value] of entries) {
      expect(key, key).toMatch(/^\d+:\d+$/)
      expect(parseBlockStateString(value), `${key} → ${value}`).not.toBeNull()
    }
  })
})

describe('createLegacyTable', () => {
  const table = createLegacyTable(legacy.blocks)
  const key = (id: number, meta: number) => {
    const state = table.resolve(id, meta)
    return state && blockStateKey(state)
  }

  it('translates well-known ids', () => {
    expect(key(0, 0)).toBe('minecraft:air')
    expect(key(1, 0)).toBe('minecraft:stone')
    expect(key(1, 1)).toBe('minecraft:granite')
    expect(key(35, 14)).toBe('minecraft:red_wool')
    expect(key(53, 3)).toBe('minecraft:oak_stairs[facing=north,half=bottom,shape=outer_right]')
  })

  it('falls back to the default variant for unlisted metadata', () => {
    expect(key(1, 15)).toBe('minecraft:stone')
  })

  it('returns null for unknown ids', () => {
    expect(table.resolve(4000, 0)).toBeNull()
    expect(table.resolve(4000, 3)).toBeNull()
  })

  it('caches results', () => {
    expect(table.resolve(35, 14)).toBe(table.resolve(35, 14))
  })

  it('loads the bundled table on demand', async () => {
    const loaded = await loadLegacyBlocks()
    expect(loaded.resolve(35, 14)?.name).toBe('minecraft:red_wool')
  })
})
