import { describe, expect, it } from 'vitest'
import { decodeModifiedUtf8 } from '../../../src/lib/parsers/nbt/modifiedUtf8'

const decode = (...bytes: number[]) => decodeModifiedUtf8(new Uint8Array(bytes), 0, bytes.length)

describe('decodeModifiedUtf8', () => {
  it('decodes ASCII', () => {
    expect(decode(...new TextEncoder().encode('minecraft:oak_log'))).toBe('minecraft:oak_log')
  })

  it('decodes 2- and 3-byte sequences', () => {
    expect(decode(...new TextEncoder().encode('Ñandú ブロック'))).toBe('Ñandú ブロック')
  })

  it('decodes NUL written as C0 80', () => {
    expect(decode(0x61, 0xc0, 0x80, 0x62)).toBe('a\u0000b')
  })

  it('decodes characters outside the BMP written as surrogate pairs (CESU-8)', () => {
    // U+1F600 → D83D DE00, each encoded as a 3-byte sequence.
    expect(decode(0xed, 0xa0, 0xbd, 0xed, 0xb8, 0x80)).toBe('😀')
  })

  it('also accepts standard 4-byte UTF-8', () => {
    expect(decode(0xf0, 0x9f, 0x98, 0x80)).toBe('😀')
  })

  it('replaces malformed bytes instead of failing', () => {
    expect(decode(0x61, 0xff, 0x62)).toBe('a�b')
    expect(decode(0xe3, 0x81)).toBe('��')
  })

  it('respects the start and length window', () => {
    const bytes = new TextEncoder().encode('xxhelloxx')
    expect(decodeModifiedUtf8(bytes, 2, 5)).toBe('hello')
  })

  it('handles the maximum NBT string length', () => {
    const long = 'é'.repeat(32_767) // 65 534 bytes
    expect(decode(...new TextEncoder().encode(long))).toBe(long)
  })
})
