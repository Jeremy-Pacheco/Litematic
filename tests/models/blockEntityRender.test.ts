import { describe, expect, it } from 'vitest'
import {
  bannerPatterns,
  buildRenderVariants,
  renderDataOf,
} from '../../src/lib/models/blockEntityRender'
import { AIR } from '../../src/lib/parsers/blockState'
import { parseBlockStateString } from '../../src/lib/parsers/blockStateString'
import { createList, NbtType, type NbtCompound, type NbtValue } from '../../src/lib/types/nbt'

const compound = (entries: [string, NbtValue][]): NbtCompound => new Map(entries)
const list = (items: NbtCompound[]) => createList(NbtType.Compound, items)

const modern = compound([
  [
    'patterns',
    list([
      compound([
        ['pattern', 'minecraft:stripe_top'],
        ['color', 'red'],
      ]),
      compound([
        ['pattern', compound([['asset_id', 'minecraft:creeper']])],
        ['color', 'black'],
      ]),
      compound([
        ['pattern', 'minecraft:../evil'],
        ['color', 'red'],
      ]),
      compound([
        ['pattern', 'minecraft:cross'],
        ['color', 'not-a-dye'],
      ]),
    ]),
  ],
])

describe('bannerPatterns', () => {
  it('reads the 1.20.5+ format, including inline patterns, and drops invalid layers', () => {
    expect(bannerPatterns(modern)).toEqual([
      { pattern: 'stripe_top', color: 'red' },
      { pattern: 'creeper', color: 'black' },
    ])
  })

  it('reads the pre-1.20.5 format with pattern codes and dye numbers', () => {
    const legacy = compound([
      [
        'Patterns',
        list([
          compound([
            ['Pattern', 'bs'],
            ['Color', 14],
          ]),
          compound([
            ['Pattern', 'zz'],
            ['Color', 1],
          ]),
        ]),
      ],
    ])
    expect(bannerPatterns(legacy)).toEqual([{ pattern: 'stripe_bottom', color: 'red' }])
  })

  it('reads Sponge v3 data and returns null without patterns', () => {
    expect(bannerPatterns(compound([['Data', modern]]))).toHaveLength(2)
    expect(bannerPatterns(compound([['id', 'minecraft:banner']]))).toBeNull()
    expect(renderDataOf('minecraft:chest', modern)).toBeNull()
    expect(renderDataOf('minecraft:banner', modern)?.patterns).toHaveLength(2)
  })
})

describe('buildRenderVariants', () => {
  const banner = parseBlockStateString('minecraft:white_banner[rotation=0]')!
  const base = {
    size: { x: 3, y: 1, z: 1 },
    palette: [AIR, banner],
    blocks: new Uint16Array([1, 1, 1]),
  }
  const entity = (x: number, nbt: NbtCompound) => ({
    pos: { x, y: 0, z: 0 },
    id: 'minecraft:banner',
    nbt,
  })

  it('keeps the structure as it is when no block needs a variant', () => {
    const result = buildRenderVariants({ ...base, blockEntities: [] })
    expect(result.variants).toBe(0)
    expect(result.blocks).toBe(base.blocks)
  })

  it('adds one palette entry per distinct look and remaps a copy of the blocks', () => {
    const other = compound([
      [
        'patterns',
        list([
          compound([
            ['pattern', 'minecraft:cross'],
            ['color', 'blue'],
          ]),
        ]),
      ],
    ])
    const result = buildRenderVariants({
      ...base,
      blockEntities: [entity(0, modern), entity(1, modern), entity(2, other)],
    })
    expect(result.variants).toBe(2)
    expect(result.palette).toHaveLength(4)
    expect(result.palette[2]).toBe(banner)
    expect([...result.blocks]).toEqual([2, 2, 3])
    expect([...base.blocks]).toEqual([1, 1, 1]) // original untouched
    expect(result.data[2]?.patterns[0]).toEqual({ pattern: 'stripe_top', color: 'red' })
    expect(result.data[1]).toBeNull()
  })

  it('ignores block entities outside the structure or on air', () => {
    const result = buildRenderVariants({
      ...base,
      blocks: new Uint16Array([0, 1, 1]),
      blockEntities: [entity(0, modern), entity(9, modern)],
    })
    expect(result.variants).toBe(0)
  })
})
