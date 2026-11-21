/**
 * Sequential reader of unsigned varints (7 bits per byte, least significant
 * group first, high bit = "more bytes follow"), as used by Sponge schematics
 * for block data. Values are limited to 32 bits (at most 5 bytes).
 */
export class VarintReader {
  readonly #bytes: Uint8Array
  #offset = 0

  /** Accepts the signed `Int8Array` from the NBT reader without copying. */
  constructor(data: Int8Array | Uint8Array) {
    this.#bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  }

  get offset(): number {
    return this.#offset
  }

  get remaining(): number {
    return this.#bytes.length - this.#offset
  }

  /**
   * Reads the next value, or returns -1 if the data ends in the middle of a
   * varint or a varint is longer than 5 bytes.
   */
  next(): number {
    const bytes = this.#bytes
    let offset = this.#offset
    if (offset >= bytes.length) return -1
    let byte = bytes[offset++]
    // Fast path: single-byte values (palettes up to 128 states).
    if (byte < 0x80) {
      this.#offset = offset
      return byte
    }
    let value = byte & 0x7f
    let shift = 7
    for (;;) {
      if (offset >= bytes.length || shift > 28) return -1
      byte = bytes[offset++]
      value |= (byte & 0x7f) << shift
      if (byte < 0x80) break
      shift += 7
    }
    this.#offset = offset
    return value >>> 0
  }
}
