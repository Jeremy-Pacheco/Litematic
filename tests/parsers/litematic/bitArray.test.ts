import { describe, expect, it } from 'vitest'
import {
  bitsForPalette,
  PackedReader,
  requiredLongs,
} from '../../../src/lib/parsers/litematic/bitArray'
import { readNbt } from '../../../src/lib/parsers/nbt/NbtReader'
import { getLongArray } from '../../../src/lib/parsers/nbt/access'
import { encodeNbt, longArray } from '../../helpers/nbt'
import { packLitematica } from '../../helpers/litematic'

/** Packs with the Java port, round-trips through NBT and decodes with PackedReader. */
function roundTrip(values: number[], bits: number): number[] {
  const nbt = readNbt(encodeNbt({ a: longArray(packLitematica(values, bits)) }))
  const reader = new PackedReader(getLongArray(nbt.root, 'a')!, bits)
  return values.map(() => reader.next())
}

/** Deterministic pseudo-random values in [0, 2^bits). */
function values(count: number, bits: number, seed = 1): number[] {
  let state = seed
  const max = 2 ** bits
  return Array.from({ length: count }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return Math.floor((state / 2 ** 32) * max)
  })
}

describe('bitsForPalette', () => {
  it('uses at least 2 bits', () => {
    expect(bitsForPalette(1)).toBe(2)
    expect(bitsForPalette(2)).toBe(2)
    expect(bitsForPalette(4)).toBe(2)
  })

  it('uses ceil(log2(n)) above that', () => {
    expect(bitsForPalette(5)).toBe(3)
    expect(bitsForPalette(52)).toBe(6) // the real STONE-TOWER file
    expect(bitsForPalette(64)).toBe(6)
    expect(bitsForPalette(65)).toBe(7)
    expect(bitsForPalette(65536)).toBe(16)
  })
})

describe('requiredLongs', () => {
  it('rounds up to whole longs', () => {
    expect(requiredLongs(73644, 6)).toBe(6905) // the real STONE-TOWER region
    expect(requiredLongs(32, 2)).toBe(1)
    expect(requiredLongs(33, 2)).toBe(2)
  })
})

describe('PackedReader', () => {
  for (const bits of [2, 3, 5, 6, 7, 9, 13, 16, 17, 31, 32]) {
    it(`decodes ${bits}-bit entries, including those that span two longs`, () => {
      const input = values(500, bits, bits)
      expect(roundTrip(input, bits)).toEqual(input)
    })
  }

  it('decodes maximum values at every bit position', () => {
    for (const bits of [5, 6, 11, 32]) {
      const input = new Array(200).fill(2 ** bits - 1)
      expect(roundTrip(input, bits)).toEqual(input)
    }
  })

  it('rejects impossible bit widths', () => {
    const empty = { kind: 'longArray' as const, words: new Uint32Array(2) }
    expect(() => new PackedReader(empty, 0)).toThrow(RangeError)
    expect(() => new PackedReader(empty, 33)).toThrow(RangeError)
  })
})
