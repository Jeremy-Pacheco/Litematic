import type { NbtLongArray } from '../../types/nbt'

/**
 * Litematica's packed block array (`LitematicaBitArray`).
 *
 * Every entry uses `bits` bits, packed back to back from the least significant
 * bit of `long` 0 upwards. Unlike vanilla chunk storage since 1.16, an entry
 * **may span two longs**: there is no padding at the end of each long.
 */

/** Bits per entry for a palette of `paletteSize` states: `max(2, ceil(log2 n))`. */
export function bitsForPalette(paletteSize: number): number {
  return Math.max(2, 32 - Math.clz32(Math.max(1, paletteSize) - 1))
}

/** Number of longs needed to store `count` entries of `bits` bits. */
export function requiredLongs(count: number, bits: number): number {
  return Math.ceil((count * bits) / 64)
}

/**
 * Sequential reader over the packed entries, using only 32-bit arithmetic.
 *
 * The long array is stored as big-endian word pairs `[hi0, lo0, hi1, lo1, …]`.
 * Seen as a stream of 32-bit words from the least significant end, word `k`
 * is `words[k ^ 1]` (`lo0, hi0, lo1, hi1, …`).
 */
export class PackedReader {
  readonly #words: Uint32Array
  readonly #bits: number
  readonly #mask: number
  #word = 0
  #shift = 0

  constructor(array: NbtLongArray, bits: number) {
    if (bits < 1 || bits > 32) throw new RangeError(`Invalid bits per entry: ${bits}`)
    this.#words = array.words
    this.#bits = bits
    this.#mask = bits === 32 ? 0xffffffff : (1 << bits) - 1
  }

  /** Returns the next entry. */
  next(): number {
    const words = this.#words
    const shift = this.#shift
    let value = words[this.#word ^ 1] >>> shift
    if (shift + this.#bits > 32) value |= words[(this.#word + 1) ^ 1] << (32 - shift)
    value = (value & this.#mask) >>> 0

    this.#shift += this.#bits
    if (this.#shift >= 32) {
      this.#shift -= 32
      this.#word++
    }
    return value
  }
}
