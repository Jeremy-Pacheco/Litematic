/**
 * In-memory representation of NBT produced by `NbtReader`.
 *
 * Designed for large structure files:
 * - Big arrays are typed arrays, never one object per element.
 * - `ByteArray` is a zero-copy view over the decompressed buffer.
 * - `LongArray` keeps each 64-bit value as two 32-bit words, which is what the
 *   bit-packed block arrays of `.litematic` need, without BigInt arithmetic.
 * - Compounds are `Map`s, so keys such as `__proto__` are plain data.
 *
 * Scalar numbers (byte, short, int, float, double) become `number` and longs
 * become `bigint`. The exact scalar tag type is not kept: this model is for
 * reading. Writing NBT is done with Deepslate.
 */

/** NBT tag ids, as stored in the binary format. */
export const NbtType = {
  End: 0,
  Byte: 1,
  Short: 2,
  Int: 3,
  Long: 4,
  Float: 5,
  Double: 6,
  ByteArray: 7,
  String: 8,
  List: 9,
  Compound: 10,
  IntArray: 11,
  LongArray: 12,
} as const

export type NbtTypeId = (typeof NbtType)[keyof typeof NbtType]

/** Array of signed 64-bit integers stored as big-endian word pairs. */
export class NbtLongArray {
  /** `words[2 * i]` is the high 32 bits of element `i`, `words[2 * i + 1]` the low 32 bits. */
  readonly words: Uint32Array

  constructor(words: Uint32Array) {
    if (words.length % 2 !== 0) throw new RangeError('LongArray needs an even number of words')
    this.words = words
  }

  get length(): number {
    return this.words.length / 2
  }

  /** Element `index` as a signed bigint. Slow path, for occasional access. */
  get(index: number): bigint {
    const hi = BigInt(this.words[2 * index])
    const lo = BigInt(this.words[2 * index + 1])
    return BigInt.asIntN(64, (hi << 32n) | lo)
  }
}

export class NbtList {
  constructor(
    /** Tag id of every element (`End` for an empty list). */
    readonly elementType: NbtTypeId,
    readonly items: NbtValue[],
  ) {}
}

export type NbtCompound = Map<string, NbtValue>

export type NbtValue =
  number | bigint | string | Int8Array | Int32Array | NbtLongArray | NbtList | NbtCompound

/** A parsed NBT file: the root compound and its (usually empty) name. */
export interface NbtDocument {
  name: string
  root: NbtCompound
}
