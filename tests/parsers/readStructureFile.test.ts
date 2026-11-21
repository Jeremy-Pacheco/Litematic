import { describe, expect, it } from 'vitest'
import { toStructureReadError } from '../../src/lib/parsers/errors'
import { readStructureFile, type ReadProgress } from '../../src/lib/parsers/readStructureFile'
import { compound, compress, encodeNbt, int, longArray, str } from '../helpers/nbt'

const litematic = encodeNbt({
  Version: int(6),
  MinecraftDataVersion: int(3953),
  Metadata: compound({ EnclosingSize: compound({ x: int(2), y: int(3), z: int(4) }) }),
  Regions: compound({ main: compound({ BlockStates: longArray([1n, 2n, 3n]) }) }),
})

describe('readStructureFile', () => {
  it('reads a gzip Litematica file end to end', async () => {
    const gz = await compress(litematic)
    const phases: ReadProgress['phase'][] = []
    const { document, info } = await readStructureFile(new Blob([gz as BlobPart]), {
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
    expect(info.durationMs).toBeGreaterThanOrEqual(0)
    expect(phases[0]).toBe('decompressing')
    expect(phases.at(-1)).toBe('parsing')
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
