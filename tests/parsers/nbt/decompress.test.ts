import { describe, expect, it } from 'vitest'
import { StructureReadError, toStructureReadError } from '../../../src/lib/parsers/errors'
import { decompressBlob, detectCompression } from '../../../src/lib/parsers/nbt/decompress'
import { compress, encodeNbt, str } from '../../helpers/nbt'

const blob = (data: Uint8Array) => new Blob([data as BlobPart])

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  const error = await promise.then(
    () => {
      throw new Error('Expected a rejection')
    },
    (e: unknown) => e,
  )
  expect(toStructureReadError(error).code).toBe(code)
}

describe('detectCompression', () => {
  it('recognizes gzip, zlib and raw NBT from the first bytes', () => {
    expect(detectCompression(new Uint8Array([0x1f, 0x8b]))).toBe('gzip')
    expect(detectCompression(new Uint8Array([0x78, 0x9c]))).toBe('zlib')
    expect(detectCompression(new Uint8Array([0x78, 0x01]))).toBe('zlib')
    expect(detectCompression(new Uint8Array([0x0a, 0x00]))).toBe('none')
  })

  it('rejects anything else', () => {
    expect(detectCompression(new TextEncoder().encode('PK'))).toBeNull()
    expect(detectCompression(new Uint8Array([]))).toBeNull()
  })
})

describe('decompressBlob', () => {
  const nbt = encodeNbt({ id: str('minecraft:stone'.repeat(10_000)) })

  it('decompresses gzip and reports progress up to the full size', async () => {
    const gz = await compress(nbt, 'gzip')
    const progress: number[] = []
    const { data, compression } = await decompressBlob(blob(gz), {
      onProgress: (consumed) => progress.push(consumed),
    })
    expect(compression).toBe('gzip')
    expect(data).toEqual(nbt)
    expect(progress.at(-1)).toBe(gz.byteLength)
  })

  it('decompresses zlib, growing the output buffer as needed', async () => {
    const big = new Uint8Array(3 * 1024 * 1024)
    big[0] = 0x0a
    const { data, compression } = await decompressBlob(blob(await compress(big, 'deflate')))
    expect(compression).toBe('zlib')
    expect(data).toEqual(big)
  })

  it('accepts uncompressed NBT', async () => {
    const { data, compression } = await decompressBlob(blob(nbt))
    expect(compression).toBe('none')
    expect(data).toEqual(nbt)
  })

  it('rejects data that is not NBT', async () => {
    await expectCode(decompressBlob(blob(new TextEncoder().encode('hello'))), 'unrecognized-data')
  })

  it('stops at the size limit (ZIP bomb protection)', async () => {
    const bomb = await compress(new Uint8Array(4 * 1024 * 1024), 'gzip') // ~4 KB compressed
    expect(bomb.byteLength).toBeLessThan(10_000)
    await expectCode(decompressBlob(blob(bomb), { maxBytes: 1024 * 1024 }), 'too-large')
  })

  it('applies the limit to uncompressed files too', async () => {
    await expectCode(decompressBlob(blob(nbt), { maxBytes: 100 }), 'too-large')
  })

  it('reports damaged compressed data', async () => {
    const gz = await compress(nbt, 'gzip')
    const damaged = gz.slice()
    for (let i = 20; i < damaged.length - 8; i += 7) damaged[i] ^= 0xff
    await expectCode(decompressBlob(blob(damaged)), 'corrupt-compression')
  })

  it('reports truncated compressed data', async () => {
    const gz = await compress(nbt, 'gzip')
    await expectCode(decompressBlob(blob(gz.subarray(0, gz.length / 2))), 'corrupt-compression')
  })

  it('can be cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    await expectCode(decompressBlob(blob(nbt), { signal: controller.signal }), 'cancelled')
  })
})

describe('toStructureReadError', () => {
  it('keeps StructureReadError as is', () => {
    const error = new StructureReadError('invalid-nbt', 'x')
    expect(toStructureReadError(error)).toBe(error)
  })

  it('maps failed allocations to out-of-memory', () => {
    expect(toStructureReadError(new RangeError('Array buffer allocation failed')).code).toBe(
      'out-of-memory',
    )
  })

  it('maps anything else to read-failed', () => {
    expect(toStructureReadError(new Error('boom')).code).toBe('read-failed')
    expect(toStructureReadError('weird').code).toBe('read-failed')
  })
})
