import { describe, expect, it } from 'vitest'
import { buildMaterialList } from '../../src/lib/materials/materialList'
import { LayerCounts, MAX_TABLE_ENTRIES } from '../../src/lib/materials/layerCounts'
import { AIR } from '../../src/lib/parsers/blockState'
import { parseBlockStateString } from '../../src/lib/parsers/blockStateString'

const palette = [
  AIR,
  parseBlockStateString('minecraft:stone')!,
  parseBlockStateString('minecraft:oak_planks')!,
]
// 2 × 3 × 1: layer 0 = [stone, stone], layer 1 = [planks, air], layer 2 = [stone, planks]
const blocks = new Uint16Array([1, 1, 2, 0, 1, 2])
const structure = {
  size: { x: 2, y: 3, z: 1 },
  palette,
  blocks,
  blockCounts: new Uint32Array([1, 3, 2]),
}

describe('LayerCounts', () => {
  it('counts the states of a layer and of a range', () => {
    const counts = new LayerCounts(structure)
    expect([...counts.forRange(0, 0)]).toEqual([0, 2, 0])
    expect([...counts.forRange(1, 2)]).toEqual([1, 1, 2])
    expect([...counts.forRange(2, 2)]).toEqual([0, 1, 1])
  })

  it('returns the whole-structure counts for the full range and clamps ranges', () => {
    const counts = new LayerCounts(structure)
    expect(counts.forRange(0, 2)).toBe(structure.blockCounts)
    expect([...counts.forRange(-5, 0)]).toEqual([0, 2, 0])
    expect([...counts.forRange(3, 9)]).toEqual([0, 0, 0])
  })

  it('scans the layers when the table would be too large', () => {
    const huge = { ...structure, size: { x: 2, y: 3, z: 1 } }
    // A palette padded so that layers × states exceeds the table limit.
    const padded = [...palette, ...new Array(Math.ceil(MAX_TABLE_ENTRIES / 3)).fill(AIR)]
    const counts = new LayerCounts({ ...huge, palette: padded })
    expect([...counts.forRange(1, 1).subarray(0, 3)]).toEqual([1, 0, 1])
  })

  it('feeds the material list of a layer', () => {
    const list = buildMaterialList({
      palette,
      blockCounts: new LayerCounts(structure).forRange(1, 1),
    })
    expect(list.items.map((m) => [m.item, m.required])).toEqual([['minecraft:oak_planks', 1]])
  })
})
