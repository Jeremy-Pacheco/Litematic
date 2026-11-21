import { describe, expect, it } from 'vitest'
import { AIR } from '../../src/lib/parsers/blockState'
import { parseBlockStateString } from '../../src/lib/parsers/blockStateString'
import {
  blockDisplayName,
  buildMaterialList,
  itemDisplayName,
} from '../../src/lib/materials/materialList'
import { stackBreakdown, stackSize } from '../../src/lib/materials/stackSizes'
import type { BlockState } from '../../src/lib/types/structure'

function structure(entries: [string, number][]) {
  const palette: BlockState[] = [AIR, ...entries.map(([text]) => parseBlockStateString(text)!)]
  const blockCounts = new Uint32Array([1000, ...entries.map(([, n]) => n)])
  return { palette, blockCounts }
}

describe('buildMaterialList', () => {
  it('groups states of the same item and excludes air', () => {
    const list = buildMaterialList(
      structure([
        ['minecraft:oak_stairs[facing=north]', 10],
        ['minecraft:oak_stairs[facing=south]', 5],
        ['minecraft:stone', 100],
      ]),
    )
    expect(list.items).toEqual([
      { item: 'minecraft:stone', required: 100, category: 'item' },
      { item: 'minecraft:oak_stairs', required: 15, category: 'item' },
    ])
    expect(list.totalItems).toBe(115)
  })

  it('applies per-block amounts and merges different blocks into one item', () => {
    const list = buildMaterialList(
      structure([
        ['minecraft:torch', 3],
        ['minecraft:wall_torch[facing=east]', 4],
        ['minecraft:stone_slab[type=double]', 10],
        ['minecraft:stone_slab[type=bottom]', 1],
        ['minecraft:oak_door[half=lower]', 2],
        ['minecraft:oak_door[half=upper]', 2],
      ]),
    )
    const required = Object.fromEntries(list.items.map((m) => [m.item, m.required]))
    expect(required).toEqual({
      'minecraft:torch': 7,
      'minecraft:stone_slab': 21,
      'minecraft:oak_door': 2,
    })
  })

  it('puts fluids and unobtainable blocks apart, outside the total', () => {
    const list = buildMaterialList(
      structure([
        ['minecraft:stone', 5],
        ['minecraft:water[level=0]', 3],
        ['minecraft:bedrock', 2],
      ]),
    )
    expect(list.items.map((m) => m.item)).toEqual(['minecraft:stone'])
    expect(list.special.map((m) => [m.item, m.category])).toEqual([
      ['minecraft:water_bucket', 'fluid'],
      ['minecraft:bedrock', 'unobtainable'],
    ])
    expect(list.totalItems).toBe(5)
  })

  it('skips palette entries that are never used', () => {
    const list = buildMaterialList(structure([['minecraft:stone', 0]]))
    expect(list.items).toEqual([])
  })
})

describe('itemDisplayName', () => {
  it('humanizes vanilla ids', () => {
    expect(itemDisplayName('minecraft:oak_stairs')).toBe('Oak stairs')
    expect(itemDisplayName('minecraft:tnt')).toBe('Tnt')
  })

  it('keeps other namespaces visible', () => {
    expect(itemDisplayName('create:large_cogwheel')).toBe('create: Large cogwheel')
  })
})

describe('stacks', () => {
  it('knows the stack size of common exceptions', () => {
    expect(stackSize('minecraft:stone')).toBe(64)
    expect(stackSize('minecraft:oak_sign')).toBe(16)
    expect(stackSize('minecraft:white_banner')).toBe(16)
    expect(stackSize('minecraft:red_bed')).toBe(1)
    expect(stackSize('minecraft:water_bucket')).toBe(1)
    expect(stackSize('minecraft:shulker_box')).toBe(1)
  })

  it('breaks counts into stacks and shulker boxes', () => {
    expect(stackBreakdown(204, 64)).toEqual({ stacks: 3, remainder: 12, shulkerBoxes: 204 / 1728 })
    expect(stackBreakdown(1728, 64).shulkerBoxes).toBe(1)
    expect(stackBreakdown(5, 64)).toMatchObject({ stacks: 0, remainder: 5 })
  })
})

describe('blockDisplayName', () => {
  const lang = {
    'block.minecraft.brown_banner': 'Brown Banner',
    'block.minecraft.wall_torch': 'Wall Torch',
    'block.minecraft.oak_stairs': 'Oak Stairs',
  }
  const state = (s: string) => parseBlockStateString(s)!

  it("uses the block's own name when the game has one", () => {
    expect(blockDisplayName(state('minecraft:oak_stairs[facing=north]'), lang)).toBe('Oak Stairs')
    expect(blockDisplayName(state('minecraft:wall_torch[facing=east]'), lang)).toBe('Wall Torch')
  })

  it('falls back to the name of the item that places it', () => {
    expect(blockDisplayName(state('minecraft:brown_wall_banner[facing=east]'), lang)).toBe(
      'Brown Banner',
    )
  })

  it('builds a readable name without the language table', () => {
    expect(blockDisplayName(state('minecraft:oak_stairs'))).toBe('Oak stairs')
  })
})
