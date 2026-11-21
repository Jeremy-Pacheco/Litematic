import { describe, expect, it } from 'vitest'
import { toStructureReadError } from '../../src/lib/parsers/errors'
import { readStructureFile, type ReadProgress } from '../../src/lib/parsers/readStructureFile'
import { litematicRoot, region } from '../helpers/litematic'
import { byteArray, compound, compress, encodeNbt, int, short, str } from '../helpers/nbt'

// 2 × 3 × 4 region, all stone.
const litematic = encodeNbt(
  litematicRoot(
    {
      main: region({
        position: [0, 0, 0],
        size: [2, 3, 4],
        palette: ['minecraft:air', 'minecraft:stone'],
        blocks: new Array(24).fill(1),
      }),
    },
    { version: 6, dataVersion: 3953 },
  ),
)

describe('readStructureFile', () => {
  it('reads and parses a gzip Litematica file end to end', async () => {
    const gz = await compress(litematic)
    const phases: ReadProgress['phase'][] = []
    const { document, info, structure } = await readStructureFile(new Blob([gz as BlobPart]), {
      onProgress: (p) => phases.push(p.phase),
    })

    expect(document.root.has('Regions')).toBe(true)
    expect(info).toMatchObject({
      format: 'litematic',
      formatVersion: 6,
      dataVersion: 3953,
      dimensions: { x: 2, y: 3, z: 4 },
      compression: 'gzip',
      compressedBytes: gz.byteLength,
      decompressedBytes: litematic.byteLength,
    })
    expect(structure?.nonAirBlocks).toBe(24)
    expect(info.durationMs).toBeGreaterThanOrEqual(0)
    expect(phases[0]).toBe('decompressing')
    expect(phases).toContain('parsing')
    expect(phases.at(-1)).toBe('decoding')
  })

  it('returns no structure for formats without a parser yet', async () => {
    const sponge = await compress(
      encodeNbt({
        Version: int(2),
        DataVersion: int(3953),
        Width: short(1),
        Height: short(1),
        Length: short(1),
        Palette: compound({ 'minecraft:air': int(0) }),
        BlockData: byteArray(new Int8Array(1)),
      }),
    )
    const { info, structure } = await readStructureFile(new Blob([sponge as BlobPart]))
    expect(info.format).toBe('schem')
    expect(structure).toBeNull()
  })

  it('rejects valid NBT that is not a structure', async () => {
    const other = await compress(encodeNbt({ hello: str('world') }))
    const error = await readStructureFile(new Blob([other as BlobPart])).catch((e: unknown) => e)
    expect(toStructureReadError(error).code).toBe('unknown-format')
  })

  it('rejects truncated NBT inside a valid gzip', async () => {
    const truncated = await compress(litematic.subarray(0, litematic.length - 10))
    const error = await readStructureFile(new Blob([truncated as BlobPart])).catch(
      (e: unknown) => e,
    )
    expect(toStructureReadError(error).code).toBe('invalid-nbt')
  })
})
