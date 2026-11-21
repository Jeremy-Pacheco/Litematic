/**
 * In-memory representation of NBT produced by `NbtReader`.
 *
 * Designed for large structure files:
 * - Big arrays are typed arrays, never one object per element.
 * - `ByteArray` is a zero-copy view over the decompressed buffer.
 * - `LongArray` keeps each 64-bit value as two 32-bit words, which is what the
 *   bit-packed block arrays of `.litematic` need, without BigInt arithmetic.
 * - Compounds are `Map`s, so keys such as `__proto__` are plain data.
 * - Lists and long arrays are plain objects tagged with `kind` (not classes),
 *   so they survive `postMessage` between a worker and the page: structured
 *   clone keeps `Map`, typed arrays and plain objects, but drops prototypes.
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
export interface NbtLongArray {
  readonly kind: 'longArray'
  /** `words[2 * i]` is the high 32 bits of element `i`, `words[2 * i + 1]` the low 32 bits. */
  readonly words: Uint32Array
}

export interface NbtList {
  readonly kind: 'list'
  /** Tag id of every element (`End` for an empty list). */
  readonly elementType: NbtTypeId
  readonly items: NbtValue[]
}

export type NbtCompound = Map<string, NbtValue>

export type NbtValue =
  number | bigint | string | Int8Array | Int32Array | NbtLongArray | NbtList | NbtCompound

/** A parsed NBT file: the root compound and its (usually empty) name. */
export interface NbtDocument {
  name: string
  root: NbtCompound
}

export function createLongArray(words: Uint32Array): NbtLongArray {
  if (words.length % 2 !== 0) throw new RangeError('LongArray needs an even number of words')
  return { kind: 'longArray', words }
}

export function createList(elementType: NbtTypeId, items: NbtValue[]): NbtList {
  return { kind: 'list', elementType, items }
}

function hasKind(value: NbtValue | undefined, kind: string): boolean {
  return (
    typeof value === 'object' &&
    !(value instanceof Map) &&
    !ArrayBuffer.isView(value) &&
    (value as { kind?: unknown }).kind === kind
  )
}

export function isNbtList(value: NbtValue | undefined): value is NbtList {
  return hasKind(value, 'list')
}

export function isNbtLongArray(value: NbtValue | undefined): value is NbtLongArray {
  return hasKind(value, 'longArray')
}

export function isNbtCompound(value: NbtValue | undefined): value is NbtCompound {
  return value instanceof Map
}

/** Number of elements of a long array. */
export function longArrayLength(array: NbtLongArray): number {
  return array.words.length / 2
}

/** Element `index` of a long array as a signed bigint. Slow path, for occasional access. */
export function longArrayGet(array: NbtLongArray, index: number): bigint {
  const hi = BigInt(array.words[2 * index])
  const lo = BigInt(array.words[2 * index + 1])
  return BigInt.asIntN(64, (hi << 32n) | lo)
}

/**
 * Deep copy that owns its memory. `ByteArray` values from the reader are views
 * over the whole decompressed file; sending one to another thread would copy
 * that entire buffer. Use this before posting NBT fragments (block entities…).
 */
export function detachNbt<T extends NbtValue>(value: T): T {
  return detachValue(value) as T
}

function detachValue(value: NbtValue): NbtValue {
  if (isNbtCompound(value)) {
    const copy: NbtCompound = new Map()
    for (const [key, item] of value) copy.set(key, detachValue(item))
    return copy
  }
  if (value instanceof Int8Array || value instanceof Int32Array) return value.slice()
  if (isNbtLongArray(value)) return createLongArray(value.words.slice())
  if (isNbtList(value)) return createList(value.elementType, value.items.map(detachValue))
  return value
}
