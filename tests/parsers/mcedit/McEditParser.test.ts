import { describe, expect, it } from 'vitest'
import legacy from '../../../src/lib/data/legacyBlocks.json'
import { blockStateKey } from '../../../src/lib/parsers/blockState'
import { toStructureReadError } from '../../../src/lib/parsers/errors'
import { createLegacyTable } from '../../../src/lib/parsers/mcedit/legacyBlocks'
import { parseMcEditWith } from '../../../src/lib/parsers/mcedit/McEditParser'
import { readNbt } from '../../../src/lib/parsers/nbt/NbtReader'
import { blockIndex, type Structure } from '../../../src/lib/types/structure'
import { byteArray, encodeNbt, str } from '../../helpers/nbt'
import { mceditRoot, type McEditSpec } from '../../helpers/mcedit'

const table = createLegacyTable(legacy.blocks)
const parse = (spec: McEditSpec) =>
  parseMcEditWith(readNbt(encodeNbt(mceditRoot(spec))).root, table)

function at(s: Structure, x: number, y: number, z: number): string {
  return blockStateKey(s.palette[s.blocks[blockIndex(s.size, x, y, z)]])
}

function expectError(fn: () => unknown, code: string): void {
  try {
    fn()
  } catch (error) {
    expect(toStructureReadError(error).code).toBe(code)
    return
  }
  throw new Error('Expected an error')
}

describe('parseMcEditWith', () => {
  it('translates id:meta in y·W·L + z·W + x order', () => {
    // 2 × 2 × 2: stone at (1,1,1), red wool at (0,0,1), rest air.
    const ids = new Array(8).fill(0)
    const metas = new Array(8).fill(0)
    ids[1 * 4 + 1 * 2 + 1] = 1
    ids[0 * 4 + 1 * 2 + 0] = 35
    metas[0 * 4 + 1 * 2 + 0] = 14
    const s = parse({ size: [2, 2, 2], ids, metas })
    expect(s.format).toBe('schematic')
    expect(at(s, 1, 1, 1)).toBe('minecraft:stone')
    expect(at(s, 0, 0, 1)).toBe('minecraft:red_wool')
    expect(at(s, 0, 0, 0)).toBe('minecraft:air')
    expect(s.nonAirBlocks).toBe(2)
  })

  it('keeps the properties of the translated state (shape recomputed)', () => {
    const s = parse({ size: [1, 1, 1], ids: [53], metas: [3] })
    expect(s.palette[1]).toEqual({
      name: 'minecraft:oak_stairs',
      properties: { half: 'bottom', shape: 'straight', facing: 'north' },
    })
    // The table default (outer_right) is no longer used, so it is dropped.
    expect(s.palette).toHaveLength(2)
  })

  it('combines AddBlocks nibbles for ids above 255 (even: low, odd: high)', () => {
    // 256 and 257 are unknown in vanilla 1.12 → read as air, but must be
    // decoded as 256/257 (not 0/1): 1 = stone would be wrong.
    const s = parse({ size: [4, 1, 1], ids: [256 + 1, 512 + 1, 1, 256 + 35], metas: [0, 0, 0, 14] })
    expect(at(s, 2, 0, 0)).toBe('minecraft:stone')
    expect(s.nonAirBlocks).toBe(1)
    expect(s.warnings.unknownLegacyBlocks).toBe(3)
  })

  it('supports the older one-byte-per-block Add array', () => {
    const s = parse({ size: [2, 1, 1], ids: [1, 256 + 1], highBits: 'Add' })
    expect(at(s, 0, 0, 0)).toBe('minecraft:stone')
    expect(s.warnings.unknownLegacyBlocks).toBe(1)
  })

  it('reuses palette entries', () => {
    const s = parse({ size: [3, 1, 1], ids: [1, 1, 1] })
    expect(s.palette.map((p) => p.name)).toEqual(['minecraft:air', 'minecraft:stone'])
    expect(s.warnings.approximateLegacyStates).toBe(false)
    expect(s.warnings.legacyBlockNames).toBe(false)
  })

  it('reports increasing progress up to 1 across decoding and the neighbor pass', () => {
    const fractions: number[] = []
    const size: [number, number, number] = [128, 128, 128]
    const ids = new Array(128 ** 3).fill(85)
    parseMcEditWith(readNbt(encodeNbt(mceditRoot({ size, ids }))).root, table, (f) =>
      fractions.push(f),
    )
    expect(fractions.length).toBeGreaterThan(2)
    expect(fractions.some((f) => f > 0.5 && f < 1)).toBe(true)
    expect(fractions.every((f, i) => i === 0 || f >= fractions[i - 1])).toBe(true)
    expect(fractions.at(-1)).toBe(1)
  })

  it('flags approximate states only for skulls or banners without block entity', () => {
    const s = parse({ size: [2, 1, 1], ids: [144, 176], metas: [1, 0] })
    expect(s.warnings.approximateLegacyStates).toBe(true)
  })

  it('reads tile entities and entities, skipping those outside the structure', () => {
    const s = parse({
      size: [2, 2, 2],
      ids: new Array(8).fill(0),
      tileEntities: [
        { pos: [1, 0, 1], id: 'Chest', extra: { Lock: str('x') } },
        { pos: [5, 0, 0], id: 'Chest' },
      ],
      entities: [{ pos: [0.5, 1, 1.5], id: 'ArmorStand' }],
    })
    expect(s.blockEntities).toHaveLength(1)
    expect(s.blockEntities[0]).toMatchObject({ pos: { x: 1, y: 0, z: 1 }, id: 'Chest' })
    expect(s.blockEntities[0].nbt.get('Lock')).toBe('x')
    expect(s.entities[0]).toMatchObject({ pos: { x: 0.5, y: 1, z: 1.5 }, id: 'ArmorStand' })
    expect(s.warnings.skippedObjects).toBe(1)
  })

  it('has no metadata or versions', () => {
    const s = parse({ size: [1, 1, 1], ids: [0] })
    expect(s.formatVersion).toBeNull()
    expect(s.dataVersion).toBeNull()
    expect(s.metadata.name).toBeNull()
  })
})

describe('parseMcEditWith with invalid data', () => {
  it('rejects non-Java (Classic, Pocket) schematics', () => {
    expectError(
      () => parse({ size: [1, 1, 1], ids: [1], materials: 'Pocket' }),
      'invalid-structure',
    )
  })

  it('rejects Blocks or Data of the wrong length', () => {
    const root = mceditRoot({ size: [2, 2, 2], ids: new Array(8).fill(1) })
    root.Data = byteArray(new Uint8Array(7))
    expectError(() => parseMcEditWith(readNbt(encodeNbt(root)).root, table), 'invalid-structure')
  })

  it('rejects structures above the size limit before allocating', () => {
    const root = mceditRoot({ size: [1, 1, 1], ids: [0] })
    root.Width = { t: 'short', v: -1 }
    root.Height = { t: 'short', v: -1 }
    root.Length = { t: 'short', v: 2 }
    const start = performance.now()
    expectError(() => parseMcEditWith(readNbt(encodeNbt(root)).root, table), 'structure-too-large')
    expect(performance.now() - start).toBeLessThan(100)
  })
})
