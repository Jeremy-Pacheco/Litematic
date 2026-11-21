/**
 * Test-only helpers to build NBT files byte by byte, including malformed ones
 * and very large arrays, without depending on the reader under test.
 */

export type Tag =
  | { t: 'byte'; v: number }
  | { t: 'short'; v: number }
  | { t: 'int'; v: number }
  | { t: 'long'; v: bigint }
  | { t: 'float'; v: number }
  | { t: 'double'; v: number }
  | { t: 'string'; v: string }
  | { t: 'byteArray'; v: Int8Array | Uint8Array }
  | { t: 'intArray'; v: ArrayLike<number> }
  | { t: 'longArray'; v: readonly bigint[] }
  | { t: 'list'; type: number; v: Tag[] }
  | { t: 'compound'; v: Record<string, Tag> }

export const byte = (v: number): Tag => ({ t: 'byte', v })
export const short = (v: number): Tag => ({ t: 'short', v })
export const int = (v: number): Tag => ({ t: 'int', v })
export const long = (v: bigint): Tag => ({ t: 'long', v })
export const float = (v: number): Tag => ({ t: 'float', v })
export const double = (v: number): Tag => ({ t: 'double', v })
export const str = (v: string): Tag => ({ t: 'string', v })
export const byteArray = (v: Int8Array | Uint8Array): Tag => ({ t: 'byteArray', v })
export const intArray = (v: ArrayLike<number>): Tag => ({ t: 'intArray', v })
export const longArray = (v: readonly bigint[]): Tag => ({ t: 'longArray', v })
export const list = (type: number, v: Tag[]): Tag => ({ t: 'list', type, v })
export const compound = (v: Record<string, Tag>): Tag => ({ t: 'compound', v })

const TYPE_ID: Record<Tag['t'], number> = {
  byte: 1,
  short: 2,
  int: 3,
  long: 4,
  float: 5,
  double: 6,
  byteArray: 7,
  string: 8,
  list: 9,
  compound: 10,
  intArray: 11,
  longArray: 12,
}

/** Collects output in chunks so multi-megabyte arrays are written cheaply. */
export class ByteWriter {
  #chunks: Uint8Array[] = []
  #length = 0

  bytes(data: Uint8Array): this {
    this.#chunks.push(data)
    this.#length += data.byteLength
    return this
  }

  #fixed(size: number, write: (view: DataView) => void): this {
    const chunk = new Uint8Array(size)
    write(new DataView(chunk.buffer))
    return this.bytes(chunk)
  }

  u8 = (v: number) => this.#fixed(1, (d) => d.setUint8(0, v))
  i16 = (v: number) => this.#fixed(2, (d) => d.setInt16(0, v))
  u16 = (v: number) => this.#fixed(2, (d) => d.setUint16(0, v))
  i32 = (v: number) => this.#fixed(4, (d) => d.setInt32(0, v))
  i64 = (v: bigint) => this.#fixed(8, (d) => d.setBigInt64(0, v))
  f32 = (v: number) => this.#fixed(4, (d) => d.setFloat32(0, v))
  f64 = (v: number) => this.#fixed(8, (d) => d.setFloat64(0, v))

  /** Standard UTF-8 (identical to modified UTF-8 for BMP text without NUL). */
  string(v: string): this {
    const encoded = new TextEncoder().encode(v)
    return this.u16(encoded.byteLength).bytes(encoded)
  }

  result(): Uint8Array {
    const out = new Uint8Array(this.#length)
    let offset = 0
    for (const chunk of this.#chunks) {
      out.set(chunk, offset)
      offset += chunk.byteLength
    }
    return out
  }
}

function writePayload(w: ByteWriter, tag: Tag): void {
  switch (tag.t) {
    case 'byte':
      w.u8(tag.v & 0xff)
      break
    case 'short':
      w.i16(tag.v)
      break
    case 'int':
      w.i32(tag.v)
      break
    case 'long':
      w.i64(tag.v)
      break
    case 'float':
      w.f32(tag.v)
      break
    case 'double':
      w.f64(tag.v)
      break
    case 'string':
      w.string(tag.v)
      break
    case 'byteArray':
      w.i32(tag.v.length).bytes(new Uint8Array(tag.v.buffer, tag.v.byteOffset, tag.v.byteLength))
      break
    case 'intArray': {
      const data = new DataView(new ArrayBuffer(tag.v.length * 4))
      for (let i = 0; i < tag.v.length; i++) data.setInt32(i * 4, tag.v[i])
      w.i32(tag.v.length).bytes(new Uint8Array(data.buffer))
      break
    }
    case 'longArray': {
      const data = new DataView(new ArrayBuffer(tag.v.length * 8))
      tag.v.forEach((value, i) => data.setBigInt64(i * 8, value))
      w.i32(tag.v.length).bytes(new Uint8Array(data.buffer))
      break
    }
    case 'list':
      w.u8(tag.type).i32(tag.v.length)
      for (const item of tag.v) writePayload(w, item)
      break
    case 'compound':
      for (const [key, value] of Object.entries(tag.v)) {
        w.u8(TYPE_ID[value.t]).string(key)
        writePayload(w, value)
      }
      w.u8(0)
      break
  }
}

/** Encodes a root compound as uncompressed NBT. */
export function encodeNbt(root: Record<string, Tag>, name = ''): Uint8Array {
  const w = new ByteWriter()
  w.u8(10).string(name)
  writePayload(w, compound(root))
  return w.result()
}

/** Compresses bytes with the platform CompressionStream. */
export async function compress(
  data: Uint8Array,
  format: 'gzip' | 'deflate' = 'gzip',
): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(
      new CompressionStream(format) as unknown as TransformStream<Uint8Array, Uint8Array>,
    )
  return new Uint8Array(await new Response(stream).arrayBuffer())
}
