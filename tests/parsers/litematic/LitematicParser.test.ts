import { describe, expect, it } from 'vitest'
import { blockStateKey } from '../../../src/lib/parsers/blockState'
import { toStructureReadError } from '../../../src/lib/parsers/errors'
import { parseLitematic } from '../../../src/lib/parsers/litematic/LitematicParser'
import { readNbt } from '../../../src/lib/parsers/nbt/NbtReader'
import { blockIndex, type Structure } from '../../../src/lib/types/structure'
import { byteArray, encodeNbt, int, str } from '../../helpers/nbt'
import { entity, litematicRoot, region, tileEntity, type RegionSpec } from '../../helpers/litematic'

const parse = (root: ReturnType<typeof litematicRoot>) =>
  parseLitematic(readNbt(encodeNbt(root)).root)

/** Name of the block at a position, or `air`. */
function at(structure: Structure, x: number, y: number, z: number): string {
  return blockStateKey(structure.palette[structure.blocks[blockIndex(structure.size, x, y, z)]])
}

/** A region whose block at (x,y,z) is chosen by `pick`. */
function filled(
  size: [number, number, number],
  palette: RegionSpec['palette'],
  pick: (x: number, y: number, z: number) => number,
  position: [number, number, number] = [0, 0, 0],
): RegionSpec {
  const [sx, sy, sz] = size.map(Math.abs)
  const blocks: number[] = []
  for (let y = 0; y < sy; y++)
    for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) blocks.push(pick(x, y, z))
  return { position, size, palette, blocks }
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

describe('parseLitematic', () => {
  it('places blocks in Y-Z-X order', () => {
    const s = parse(
      litematicRoot({
        main: region(
          filled([2, 3, 4], ['minecraft:air', 'minecraft:stone', 'minecraft:dirt'], (x, y, z) =>
            x === 1 && y === 2 && z === 3 ? 1 : y === 0 ? 2 : 0,
          ),
        ),
      }),
    )
    expect(s.size).toEqual({ x: 2, y: 3, z: 4 })
    expect(at(s, 1, 2, 3)).toBe('minecraft:stone')
    expect(at(s, 0, 0, 0)).toBe('minecraft:dirt')
    expect(at(s, 0, 1, 0)).toBe('minecraft:air')
    expect(s.nonAirBlocks).toBe(1 + 2 * 4)
  })

  it('keeps block state properties', () => {
    const palette: RegionSpec['palette'] = [
      'minecraft:air',
      ['minecraft:oak_stairs', { facing: 'north', half: 'bottom' }],
    ]
    const s = parse(litematicRoot({ r: region(filled([1, 1, 1], palette, () => 1)) }))
    expect(s.palette[1]).toEqual({
      name: 'minecraft:oak_stairs',
      properties: { facing: 'north', half: 'bottom' },
    })
  })

  it('handles negative sizes on every axis', () => {
    // Position (5,5,5) with size (-2,-3,-4): min corner is (4,3,2).
    const spec = filled([-2, -3, -4], ['minecraft:air', 'minecraft:stone'], (x, y, z) =>
      x === 0 && y === 0 && z === 0 ? 1 : 0,
    )
    spec.position = [5, 5, 5]
    const s = parse(litematicRoot({ r: region(spec) }))
    expect(s.size).toEqual({ x: 2, y: 3, z: 4 })
    expect(s.regions[0]).toEqual({
      name: 'r',
      min: { x: 0, y: 0, z: 0 },
      size: { x: 2, y: 3, z: 4 },
    })
    expect(at(s, 0, 0, 0)).toBe('minecraft:stone')
  })

  it('combines several regions into one bounding box', () => {
    const a = filled([2, 1, 1], ['minecraft:air', 'minecraft:stone'], () => 1, [-3, 0, 0])
    const b = filled([1, 2, 1], ['minecraft:air', 'minecraft:glass'], () => 1, [4, 1, 2])
    const s = parse(litematicRoot({ a: region(a), b: region(b) }))
    expect(s.size).toEqual({ x: 8, y: 3, z: 3 })
    expect(s.regions.map((r) => r.min)).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 7, y: 1, z: 2 },
    ])
    expect(at(s, 0, 0, 0)).toBe('minecraft:stone')
    expect(at(s, 7, 2, 2)).toBe('minecraft:glass')
    expect(s.nonAirBlocks).toBe(4)
  })

  it('merges equal states of different regions in one global palette', () => {
    const a = filled([1, 1, 1], ['minecraft:air', 'minecraft:stone'], () => 1, [0, 0, 0])
    const b = filled([1, 1, 1], ['minecraft:stone', 'minecraft:air'], () => 0, [1, 0, 0])
    const s = parse(litematicRoot({ a: region(a), b: region(b) }))
    expect(s.palette.map((p) => p.name)).toEqual(['minecraft:air', 'minecraft:stone'])
  })

  it('treats cave_air and void_air as air', () => {
    const palette = ['minecraft:cave_air', 'minecraft:void_air', 'minecraft:air', 'minecraft:stone']
    const s = parse(litematicRoot({ r: region(filled([4, 1, 1], palette, (x) => x)) }))
    expect(s.nonAirBlocks).toBe(1)
    expect(s.palette).toHaveLength(2)
  })

  it('reports overlapping regions, the last one winning', () => {
    const a = filled([2, 1, 1], ['minecraft:air', 'minecraft:stone'], () => 1)
    const b = filled([1, 1, 1], ['minecraft:air', 'minecraft:glass'], () => 1)
    const s = parse(litematicRoot({ a: region(a), b: region(b) }))
    expect(at(s, 0, 0, 0)).toBe('minecraft:glass')
    expect(s.warnings.overlappingBlocks).toBe(1)
  })

  it('reads palette indices beyond the palette as air and counts them', () => {
    // 3 palette entries → 2 bits, so index 3 is representable but invalid.
    const spec = filled([4, 1, 1], ['minecraft:air', 'minecraft:stone', 'minecraft:dirt'], (x) => x)
    const s = parse(litematicRoot({ r: region(spec) }))
    expect(s.warnings.invalidPaletteIndices).toBe(1)
    expect(s.nonAirBlocks).toBe(2)
  })

  it('places block entities and entities relative to their region', () => {
    const spec = filled([3, 3, 3], ['minecraft:air', 'minecraft:chest'], () => 0, [10, 0, 0])
    spec.tileEntities = [
      tileEntity('minecraft:chest', [1, 2, 0], { Items: byteArray(new Int8Array([1, 2])) }),
    ]
    spec.entities = [entity('minecraft:armor_stand', [0.5, 1, 2.5])]
    const other = filled([1, 1, 1], ['minecraft:air', 'minecraft:stone'], () => 1, [0, 0, 0])
    const s = parse(litematicRoot({ other: region(other), r: region(spec) }))
    expect(s.blockEntities).toHaveLength(1)
    expect(s.blockEntities[0].pos).toEqual({ x: 11, y: 2, z: 0 })
    expect(s.blockEntities[0].id).toBe('minecraft:chest')
    expect(s.entities[0].pos).toEqual({ x: 10.5, y: 1, z: 2.5 })
    expect(s.entities[0].id).toBe('minecraft:armor_stand')
  })

  it('detaches block entity NBT from the file buffer', () => {
    const spec = filled([1, 1, 1], ['minecraft:air'], () => 0)
    spec.tileEntities = [
      tileEntity('minecraft:chest', [0, 0, 0], { Data: byteArray(new Int8Array(8)) }),
    ]
    const data = encodeNbt(litematicRoot({ r: region(spec) }))
    const s = parseLitematic(readNbt(data).root)
    const bytes = s.blockEntities[0].nbt.get('Data') as Int8Array
    expect(bytes.buffer).not.toBe(data.buffer)
    expect(bytes.buffer.byteLength).toBe(8)
  })

  it('skips entities without a valid position', () => {
    const spec = filled([1, 1, 1], ['minecraft:air'], () => 0)
    spec.entities = [entity('minecraft:pig', [0, 0, 0])]
    spec.tileEntities = [tileEntity('minecraft:chest', [0, 0, 0])]
    // Break both: entity without Pos, block entity without coordinates.
    spec.entities = [{ t: 'compound', v: { id: str('minecraft:pig') } }]
    spec.tileEntities = [{ t: 'compound', v: { id: str('minecraft:chest'), x: int(0) } }]
    const s = parse(litematicRoot({ r: region(spec) }))
    expect(s.entities).toHaveLength(0)
    expect(s.blockEntities).toHaveLength(0)
    expect(s.warnings.skippedObjects).toBe(2)
  })

  it('reads metadata', () => {
    const s = parse(
      litematicRoot(
        { r: region(filled([1, 1, 1], ['minecraft:air'], () => 0)) },
        { metadata: { Name: str('Torre'), Author: str('abc'), Description: str('desc') } },
      ),
    )
    expect(s.metadata).toEqual({
      name: 'Torre',
      author: 'abc',
      description: 'desc',
      createdAt: 1_700_000_000_000,
      modifiedAt: 1_700_000_100_000,
    })
    expect(s.formatVersion).toBe(7)
    expect(s.dataVersion).toBe(4325)
  })

  it('flags pre-1.13 files', () => {
    const r = { r: region(filled([1, 1, 1], ['minecraft:air'], () => 0)) }
    expect(
      parse(litematicRoot(r, { version: 4, dataVersion: 1139 })).warnings.legacyBlockNames,
    ).toBe(true)
    expect(
      parse(litematicRoot(r, { version: 5, dataVersion: 1631 })).warnings.legacyBlockNames,
    ).toBe(false)
  })

  it('takes 17w47a (data version 1451) as the first flattened version, so 1.13.0 is not legacy', () => {
    const r = { r: region(filled([1, 1, 1], ['minecraft:air'], () => 0)) }
    const legacyAt = (dataVersion: number) =>
      parse(litematicRoot(r, { version: 5, dataVersion })).warnings.legacyBlockNames
    expect(legacyAt(1450)).toBe(true)
    expect(legacyAt(1451)).toBe(false)
    expect(legacyAt(1519)).toBe(false) // 1.13
    expect(legacyAt(1628)).toBe(false) // 1.13.1
  })
})

describe('parseLitematic with invalid data', () => {
  it('rejects regions with fewer longs than their volume needs', () => {
    const spec = filled([8, 8, 8], ['minecraft:air', 'minecraft:stone'], () => 1)
    spec.truncateLongs = 1
    expectError(() => parse(litematicRoot({ r: region(spec) })), 'invalid-structure')
  })

  it('rejects files without regions', () => {
    expectError(() => parse(litematicRoot({})), 'invalid-structure')
  })

  it('rejects structures above the size limit before allocating', () => {
    const spec = filled([1, 1, 1], ['minecraft:air'], () => 0)
    const huge = region({ ...spec, size: [2048, 2048, 2048], blocks: [] })
    const start = performance.now()
    expectError(() => parse(litematicRoot({ r: huge })), 'structure-too-large')
    expect(performance.now() - start).toBeLessThan(100)
  })
})
