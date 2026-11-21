import {
  createList,
  createLongArray,
  NbtType,
  type NbtList,
  type NbtLongArray,
  type NbtCompound,
  type NbtDocument,
  type NbtTypeId,
  type NbtValue,
} from '../../types/nbt'
import { StructureReadError } from '../errors'
import { decodeModifiedUtf8 } from './modifiedUtf8'

export interface NbtReadOptions {
  /**
   * Maximum nesting of compounds and lists. Minecraft itself stops at 512;
   * the limit prevents stack exhaustion from hostile files.
   */
  maxDepth?: number
}

export const DEFAULT_MAX_DEPTH = 512

/**
 * Smallest possible encoded size of one element of each type, used to reject
 * impossible lengths *before* allocating anything for them.
 */
const MIN_PAYLOAD_SIZE: Readonly<Record<NbtTypeId, number>> = {
  [NbtType.End]: 0,
  [NbtType.Byte]: 1,
  [NbtType.Short]: 2,
  [NbtType.Int]: 4,
  [NbtType.Long]: 8,
  [NbtType.Float]: 4,
  [NbtType.Double]: 8,
  [NbtType.ByteArray]: 4,
  [NbtType.String]: 2,
  [NbtType.List]: 5,
  [NbtType.Compound]: 1,
  [NbtType.IntArray]: 4,
  [NbtType.LongArray]: 4,
}

/**
 * Reads uncompressed big-endian Java NBT.
 *
 * Every length is validated against the bytes left before allocating, so a
 * corrupted or malicious length cannot trigger a huge allocation.
 *
 * @throws {StructureReadError} `invalid-nbt` for malformed data.
 */
export function readNbt(data: Uint8Array, options: NbtReadOptions = {}): NbtDocument {
  return new NbtReader(data, options.maxDepth ?? DEFAULT_MAX_DEPTH).readDocument()
}

class NbtReader {
  readonly #data: Uint8Array
  readonly #view: DataView
  readonly #maxDepth: number
  #offset = 0

  constructor(data: Uint8Array, maxDepth: number) {
    this.#data = data
    this.#view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    this.#maxDepth = maxDepth
  }

  readDocument(): NbtDocument {
    const type = this.#u8()
    if (type !== NbtType.Compound) {
      throw this.#error(`Root tag must be a compound, found type ${type}`)
    }
    const name = this.#string()
    const root = this.#compound(1)
    return { name, root }
  }

  #payload(type: number, depth: number): NbtValue {
    switch (type) {
      case NbtType.Byte:
        return this.#take(1, (o) => this.#view.getInt8(o))
      case NbtType.Short:
        return this.#take(2, (o) => this.#view.getInt16(o))
      case NbtType.Int:
        return this.#take(4, (o) => this.#view.getInt32(o))
      case NbtType.Long:
        return this.#take(8, (o) => this.#view.getBigInt64(o))
      case NbtType.Float:
        return this.#take(4, (o) => this.#view.getFloat32(o))
      case NbtType.Double:
        return this.#take(8, (o) => this.#view.getFloat64(o))
      case NbtType.ByteArray:
        return this.#byteArray()
      case NbtType.String:
        return this.#string()
      case NbtType.List:
        return this.#list(depth)
      case NbtType.Compound:
        return this.#compound(depth)
      case NbtType.IntArray:
        return this.#intArray()
      case NbtType.LongArray:
        return this.#longArray()
      default:
        throw this.#error(`Unknown tag type ${type}`)
    }
  }

  #compound(depth: number): NbtCompound {
    this.#checkDepth(depth)
    const compound: NbtCompound = new Map()
    for (;;) {
      const type = this.#u8()
      if (type === NbtType.End) return compound
      const name = this.#string()
      compound.set(name, this.#payload(type, depth + 1))
    }
  }

  #list(depth: number): NbtList {
    this.#checkDepth(depth)
    const elementType = this.#u8()
    if (!(elementType in MIN_PAYLOAD_SIZE)) throw this.#error(`Unknown list type ${elementType}`)
    const length = this.#length(elementType)
    if (elementType === NbtType.End && length > 0) {
      throw this.#error(`List of End tags with length ${length}`)
    }
    const items: NbtValue[] = new Array(length)
    for (let i = 0; i < length; i++) items[i] = this.#payload(elementType, depth + 1)
    return createList(elementType as NbtTypeId, items)
  }

  #byteArray(): Int8Array {
    const length = this.#length(NbtType.Byte)
    // Zero-copy view: the array shares the decompressed buffer.
    const view = new Int8Array(this.#data.buffer, this.#data.byteOffset + this.#offset, length)
    this.#offset += length
    return view
  }

  #intArray(): Int32Array {
    const length = this.#length(NbtType.Int)
    const out = new Int32Array(length)
    let o = this.#offset
    for (let i = 0; i < length; i++, o += 4) out[i] = this.#view.getInt32(o)
    this.#offset = o
    return out
  }

  #longArray(): NbtLongArray {
    const length = this.#length(NbtType.Long)
    const words = new Uint32Array(length * 2)
    let o = this.#offset
    for (let i = 0; i < words.length; i++, o += 4) words[i] = this.#view.getUint32(o)
    this.#offset = o
    return createLongArray(words)
  }

  #string(): string {
    const length = this.#take(2, (o) => this.#view.getUint16(o))
    this.#ensure(length)
    const value = decodeModifiedUtf8(this.#data, this.#offset, length)
    this.#offset += length
    return value
  }

  /** Reads an int length and checks that `length` elements of `elementType` fit. */
  #length(elementType: number): number {
    const length = this.#take(4, (o) => this.#view.getInt32(o))
    if (length < 0) throw this.#error(`Negative length ${length}`)
    const minSize = MIN_PAYLOAD_SIZE[elementType as NbtTypeId] ?? 1
    this.#ensure(length * minSize)
    return length
  }

  #u8(): number {
    return this.#take(1, (o) => this.#view.getUint8(o))
  }

  #take<T>(size: number, read: (offset: number) => T): T {
    this.#ensure(size)
    const value = read(this.#offset)
    this.#offset += size
    return value
  }

  #ensure(size: number): void {
    if (this.#offset + size > this.#data.byteLength) {
      throw this.#error(`Unexpected end of data: need ${size} bytes at offset ${this.#offset}`)
    }
  }

  #checkDepth(depth: number): void {
    if (depth > this.#maxDepth) throw this.#error(`Nesting deeper than ${this.#maxDepth}`)
  }

  #error(message: string): StructureReadError {
    return new StructureReadError('invalid-nbt', message)
  }
}
