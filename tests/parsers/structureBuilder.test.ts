import { describe, expect, it } from 'vitest'
import { AIR } from '../../src/lib/parsers/blockState'
import { parseBlockStateString } from '../../src/lib/parsers/blockStateString'
import { emptyWarnings, finishStructure } from '../../src/lib/parsers/structureBuilder'

describe('finishStructure', () => {
  it('counts each palette state and the non-air blocks in one pass', () => {
    const palette = [
      AIR,
      parseBlockStateString('minecraft:stone')!,
      parseBlockStateString('minecraft:dirt')!,
    ]
    const blocks = new Uint16Array([0, 1, 1, 2, 0, 1])
    const s = finishStructure({
      format: 'schem',
      formatVersion: 3,
      dataVersion: null,
      size: { x: 6, y: 1, z: 1 },
      palette,
      blocks,
      blockEntities: [],
      entities: [],
      regions: [],
      metadata: { name: null, author: null, description: null, createdAt: null, modifiedAt: null },
      warnings: emptyWarnings(),
    })
    expect([...s.blockCounts]).toEqual([2, 3, 1])
    expect(s.nonAirBlocks).toBe(4)
  })

  it('counts the non-air blocks of each layer', () => {
    const s = finishStructure({
      format: 'schem',
      formatVersion: 3,
      dataVersion: null,
      // 2 × 3 × 1: layers of 2 positions.
      size: { x: 2, y: 3, z: 1 },
      palette: [AIR, parseBlockStateString('minecraft:stone')!],
      blocks: new Uint16Array([1, 1, 0, 0, 0, 1]),
      blockEntities: [],
      entities: [],
      regions: [],
      metadata: { name: null, author: null, description: null, createdAt: null, modifiedAt: null },
      warnings: emptyWarnings(),
    })
    expect([...s.layerBlocks]).toEqual([2, 0, 1])
  })
})
