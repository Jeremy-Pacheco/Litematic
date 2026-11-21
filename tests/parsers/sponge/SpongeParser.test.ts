import { describe, expect, it } from 'vitest'
import { blockStateKey } from '../../../src/lib/parsers/blockState'
import { toStructureReadError } from '../../../src/lib/parsers/errors'
import { readNbt } from '../../../src/lib/parsers/nbt/NbtReader'
import { parseSponge } from '../../../src/lib/parsers/sponge/SpongeParser'
import { blockIndex, type Structure } from '../../../src/lib/types/structure'
import { byteArray, encodeNbt, int, long, str } from '../../helpers/nbt'
import { encodeVarints, spongeRoot, type SpongeSpec } from '../../helpers/sponge'

const parse = (spec: SpongeSpec) => parseSponge(readNbt(encodeNbt(spongeRoot(spec))).root)

function at(s: Structure, x: number, y: number, z: number): string {
  return blockStateKey(s.palette[s.blocks[blockIndex(s.size, x, y, z)]])
}

/** Blocks in x + z·W + y·W·L order chosen by `pick`. */
function grid(
  [w, h, l]: [number, number, number],
  pick: (x: number, y: number, z: number) => number,
): number[] {
  const out: number[] = []
  for (let y = 0; y < h; y++)
    for (let z = 0; z < l; z++) for (let x = 0; x < w; x++) out.push(pick(x, y, z))
  return out
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

const PALETTE = {
  'minecraft:air': 0,
  'minecraft:stone': 1,
  'minecraft:oak_stairs[facing=east,half=top]': 2,
}

describe.each([1, 2, 3] as const)('parseSponge v%i', (version) => {
  const size: [number, number, number] = [3, 4, 5]
  const blocks = grid(size, (x, y, z) => (x === 2 && y === 3 && z === 4 ? 2 : y === 0 ? 1 : 0))
  const spec: SpongeSpec = {
    version,
    size,
    palette: PALETTE,
    blocks,
    dataVersion: version === 1 ? undefined : 3953,
    blockEntities: [{ pos: [1, 0, 2], id: 'minecraft:chest', data: { Lock: str('key') } }],
    entities: version === 1 ? [] : [{ pos: [1.5, 1, 2.25], id: 'minecraft:armor_stand' }],
  }

  it('places blocks in x + z·W + y·W·L order', () => {
    const s = parse(spec)
    expect(s.format).toBe('schem')
    expect(s.formatVersion).toBe(version)
    expect(s.size).toEqual({ x: 3, y: 4, z: 5 })
    expect(at(s, 2, 3, 4)).toBe('minecraft:oak_stairs[facing=east,half=top]')
    expect(at(s, 0, 0, 0)).toBe('minecraft:stone')
    expect(at(s, 0, 1, 0)).toBe('minecraft:air')
    expect(s.nonAirBlocks).toBe(3 * 5 + 1)
  })

  it('reads block entities with their data', () => {
    const [be] = parse(spec).blockEntities
    expect(be.pos).toEqual({ x: 1, y: 0, z: 2 })
    expect(be.id).toBe('minecraft:chest')
    expect(be.nbt.get('Lock')).toBe('key')
  })

  if (version !== 1) {
    it('reads entities', () => {
      const [entity] = parse(spec).entities
      expect(entity.pos).toEqual({ x: 1.5, y: 1, z: 2.25 })
      expect(entity.id).toBe('minecraft:armor_stand')
    })
  }
})

describe('parseSponge', () => {
  it('reads sizes as unsigned shorts', () => {
    // 40 000 does not fit in a signed short; stored as -25 536.
    const s = parse({
      version: 2,
      size: [40_000, 1, 1],
      palette: { 'minecraft:stone': 0 },
      blocks: new Array(40_000).fill(0),
    })
    expect(s.size.x).toBe(40_000)
    expect(s.nonAirBlocks).toBe(40_000)
  })

  it('decodes palette indices of several bytes', () => {
    const palette: Record<string, number> = { 'minecraft:air': 0 }
    for (let i = 1; i < 300; i++) palette[`minecraft:block_${i}`] = i
    const s = parse({
      version: 3,
      size: [299, 1, 1],
      palette,
      blocks: grid([299, 1, 1], (x) => x + 1),
    })
    expect(at(s, 0, 0, 0)).toBe('minecraft:block_1')
    expect(at(s, 298, 0, 0)).toBe('minecraft:block_299')
  })

  it('merges air variants and keeps index 0 as air', () => {
    const s = parse({
      version: 3,
      size: [3, 1, 1],
      palette: { 'minecraft:stone': 0, 'minecraft:cave_air': 1, 'minecraft:void_air': 2 },
      blocks: [0, 1, 2],
    })
    expect(s.palette.map((p) => p.name)).toEqual(['minecraft:air', 'minecraft:stone'])
    expect(s.nonAirBlocks).toBe(1)
  })

  it('reads palette indices with gaps; unknown indices become air with a warning', () => {
    const s = parse({
      version: 2,
      size: [3, 1, 1],
      palette: { 'minecraft:stone': 5 },
      blocks: [5, 2, 99],
    })
    expect(at(s, 0, 0, 0)).toBe('minecraft:stone')
    expect(s.nonAirBlocks).toBe(1)
    expect(s.warnings.invalidPaletteIndices).toBe(2)
  })

  it('reads metadata', () => {
    const s = parse({
      version: 3,
      size: [1, 1, 1],
      palette: { 'minecraft:air': 0 },
      blocks: [0],
      metadata: { Name: str('Casa'), Author: str('alguien'), Date: long(1_700_000_000_000n) },
    })
    expect(s.metadata).toMatchObject({
      name: 'Casa',
      author: 'alguien',
      createdAt: 1_700_000_000_000,
    })
  })

  it('flags pre-1.13 data versions', () => {
    const base = {
      version: 2 as const,
      size: [1, 1, 1] as [number, number, number],
      palette: { 'minecraft:air': 0 },
      blocks: [0],
    }
    expect(parse({ ...base, dataVersion: 1343 }).warnings.legacyBlockNames).toBe(true)
    expect(parse({ ...base, dataVersion: 1631 }).warnings.legacyBlockNames).toBe(false)
    expect(parse({ ...base, version: 1 }).warnings.legacyBlockNames).toBe(false)
  })

  it('skips block entities outside the structure or without a position', () => {
    const s = parse({
      version: 3,
      size: [2, 2, 2],
      palette: { 'minecraft:air': 0 },
      blocks: new Array(8).fill(0),
      blockEntities: [
        { pos: [5, 0, 0], id: 'minecraft:chest' },
        { pos: [1, 1, 1], id: 'minecraft:chest' },
      ],
    })
    expect(s.blockEntities.map((b) => b.pos)).toEqual([{ x: 1, y: 1, z: 1 }])
    expect(s.warnings.skippedObjects).toBe(1)
  })

  it('detaches block entity data from the file buffer', () => {
    const data = encodeNbt(
      spongeRoot({
        version: 3,
        size: [1, 1, 1],
        palette: { 'minecraft:air': 0 },
        blocks: [0],
        blockEntities: [{ pos: [0, 0, 0], id: 'x', data: { Bytes: byteArray(new Int8Array(4)) } }],
      }),
    )
    const s = parseSponge(readNbt(data).root)
    expect((s.blockEntities[0].nbt.get('Bytes') as Int8Array).buffer).not.toBe(data.buffer)
  })
})

describe('parseSponge with invalid data', () => {
  const base: SpongeSpec = {
    version: 3,
    size: [2, 2, 2],
    palette: { 'minecraft:stone': 0 },
    blocks: new Array(8).fill(0),
  }

  it('rejects block data shorter than the volume', () => {
    expectError(
      () => parse({ ...base, rawData: encodeVarints(new Array(7).fill(0)) }),
      'invalid-structure',
    )
  })

  it('rejects block data longer than the volume', () => {
    expectError(
      () => parse({ ...base, rawData: encodeVarints(new Array(9).fill(0)) }),
      'invalid-structure',
    )
  })

  it('rejects a truncated varint', () => {
    const raw = new Uint8Array([...encodeVarints(new Array(7).fill(0)), 0x80])
    expectError(() => parse({ ...base, rawData: raw }), 'invalid-structure')
  })

  it('rejects malformed block state names', () => {
    expectError(
      () => parse({ ...base, palette: { 'minecraft:stone[facing': 0 } }),
      'invalid-structure',
    )
  })

  it('rejects negative or absurd palette indices', () => {
    expectError(() => parse({ ...base, palette: { 'minecraft:stone': -1 } }), 'invalid-structure')
    expectError(
      () => parse({ ...base, palette: { 'minecraft:stone': 2_000_000_000 } }),
      'invalid-structure',
    )
  })

  it('rejects files without block data', () => {
    const root = spongeRoot(base)
    const body = root.Schematic as { t: 'compound'; v: Record<string, unknown> }
    delete body.v.Blocks
    expectError(() => parseSponge(readNbt(encodeNbt(root)).root), 'invalid-structure')
  })

  it('rejects structures above the size limit before allocating', () => {
    const root = spongeRoot({ ...base, size: [65535, 65535, 2], rawData: new Uint8Array(0) })
    const start = performance.now()
    expectError(() => parseSponge(readNbt(encodeNbt(root)).root), 'structure-too-large')
    expect(performance.now() - start).toBeLessThan(100)
  })

  it('rejects a missing version', () => {
    const root = spongeRoot(base)
    const body = root.Schematic as { t: 'compound'; v: Record<string, unknown> }
    body.v.Version = int(0)
    expectError(() => parseSponge(readNbt(encodeNbt(root)).root), 'invalid-structure')
  })
})
