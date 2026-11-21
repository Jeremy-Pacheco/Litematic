import { describe, expect, it } from 'vitest'
import { VarintReader } from '../../../src/lib/parsers/sponge/varint'
import { encodeVarints } from '../../helpers/sponge'

const readAll = (bytes: Uint8Array, count: number) => {
  const reader = new VarintReader(bytes)
  return Array.from({ length: count }, () => reader.next())
}

describe('VarintReader', () => {
  it('reads single-byte values', () => {
    expect(readAll(new Uint8Array([0, 1, 127]), 3)).toEqual([0, 1, 127])
  })

  it('reads multi-byte values at every boundary', () => {
    const values = [
      128, 255, 300, 16383, 16384, 2_097_151, 2_097_152, 268_435_455, 268_435_456, 0xffffffff,
    ]
    expect(readAll(encodeVarints(values), values.length)).toEqual(values)
  })

  it('accepts the signed Int8Array of the NBT reader', () => {
    const bytes = encodeVarints([300, 5])
    const signed = new Int8Array(bytes.buffer)
    expect(readAll(new Uint8Array(signed.buffer), 2)).toEqual([300, 5])
    const reader = new VarintReader(signed)
    expect([reader.next(), reader.next()]).toEqual([300, 5])
  })

  it('returns -1 at the end of the data or in a truncated varint', () => {
    const reader = new VarintReader(new Uint8Array([5, 0x80]))
    expect(reader.next()).toBe(5)
    expect(reader.next()).toBe(-1)
    expect(new VarintReader(new Uint8Array([])).next()).toBe(-1)
  })

  it('rejects varints longer than 5 bytes', () => {
    expect(new VarintReader(new Uint8Array([0x80, 0x80, 0x80, 0x80, 0x80, 0x01])).next()).toBe(-1)
  })

  it('tracks the remaining bytes', () => {
    const reader = new VarintReader(encodeVarints([1, 300]))
    reader.next()
    expect(reader.remaining).toBe(2)
    reader.next()
    expect(reader.remaining).toBe(0)
  })
})
