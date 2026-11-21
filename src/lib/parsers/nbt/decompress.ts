import { StructureReadError } from '../errors'

/** Maximum decompressed size accepted (1 GiB). Guards against ZIP bombs. */
export const DEFAULT_MAX_DECOMPRESSED_BYTES = 1024 ** 3

export type Compression = 'gzip' | 'zlib' | 'none'

export interface DecompressOptions {
  maxBytes?: number
  signal?: AbortSignal
  /** Called with the number of *compressed* bytes consumed so far. */
  onProgress?: (consumed: number, total: number) => void
}

export interface DecompressResult {
  data: Uint8Array
  compression: Compression
}

const NBT_COMPOUND_TAG = 0x0a

/**
 * Detects the compression from the first bytes, never from the file name.
 */
export function detectCompression(head: Uint8Array): Compression | null {
  if (head.length >= 2 && head[0] === 0x1f && head[1] === 0x8b) return 'gzip'
  // zlib: CM=8 (deflate) and the header checksum is a multiple of 31.
  if (head.length >= 2 && (head[0] & 0x0f) === 8 && ((head[0] << 8) | head[1]) % 31 === 0) {
    return 'zlib'
  }
  if (head.length >= 1 && head[0] === NBT_COMPOUND_TAG) return 'none'
  return null
}

/**
 * Reads a Blob as NBT bytes, decompressing it if needed.
 *
 * - Streams the input through the native `DecompressionStream`, so the
 *   compressed file is never held in memory as a whole.
 * - Stops as soon as the output exceeds `maxBytes`.
 * - For gzip, the size stored in the trailer is used to preallocate the
 *   output once (it is only a hint: the real size is always enforced).
 *
 * @throws {StructureReadError}
 */
export async function decompressBlob(
  blob: Blob,
  options: DecompressOptions = {},
): Promise<DecompressResult> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_DECOMPRESSED_BYTES
  const { signal, onProgress } = options
  signal?.throwIfAborted()

  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer())
  const compression = detectCompression(head)
  if (!compression) {
    throw new StructureReadError('unrecognized-data', 'Not gzip, zlib or NBT data')
  }

  if (compression === 'none') {
    if (blob.size > maxBytes) throw tooLarge(maxBytes)
    const data = new Uint8Array(await blob.arrayBuffer())
    onProgress?.(blob.size, blob.size)
    return { data, compression }
  }

  const sizeHint = compression === 'gzip' ? await gzipSizeHint(blob) : 0
  const output = new GrowableBuffer(Math.min(sizeHint, maxBytes), maxBytes)

  let consumed = 0
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      consumed += chunk.byteLength
      onProgress?.(consumed, blob.size)
      controller.enqueue(chunk)
    },
  })

  const format = compression === 'gzip' ? 'gzip' : 'deflate'
  const stream = blob
    .stream()
    .pipeThrough(counter)
    .pipeThrough(
      new DecompressionStream(format) as unknown as TransformStream<Uint8Array, Uint8Array>,
    )
  const reader = stream.getReader()
  const abort = () => void reader.cancel().catch(() => {})
  signal?.addEventListener('abort', abort, { once: true })

  try {
    for (;;) {
      signal?.throwIfAborted()
      let result: ReadableStreamReadResult<Uint8Array>
      try {
        result = await reader.read()
      } catch (error) {
        signal?.throwIfAborted()
        throw new StructureReadError('corrupt-compression', 'The compressed data is damaged', {
          cause: error,
        })
      }
      if (result.done) break
      if (!output.append(result.value)) {
        abort()
        throw tooLarge(maxBytes)
      }
    }
  } finally {
    signal?.removeEventListener('abort', abort)
  }

  return { data: output.result(), compression }
}

/**
 * The last 4 bytes of a gzip member store the uncompressed size modulo 2^32.
 * Untrusted, so it is only used to size the first allocation.
 */
async function gzipSizeHint(blob: Blob): Promise<number> {
  if (blob.size < 18) return 0
  const tail = new DataView(await blob.slice(blob.size - 4).arrayBuffer())
  return tail.getUint32(0, true)
}

function tooLarge(maxBytes: number): StructureReadError {
  return new StructureReadError(
    'too-large',
    `Decompressed data exceeds the limit of ${maxBytes} bytes`,
  )
}

/** Byte buffer that grows geometrically up to a hard limit. */
class GrowableBuffer {
  #buffer: Uint8Array
  #length = 0
  readonly #limit: number

  constructor(initial: number, limit: number) {
    this.#buffer = new Uint8Array(Math.max(initial, 64 * 1024))
    this.#limit = limit
  }

  /** Appends a chunk. Returns `false` if it would exceed the limit. */
  append(chunk: Uint8Array): boolean {
    const needed = this.#length + chunk.byteLength
    if (needed > this.#limit) return false
    if (needed > this.#buffer.byteLength) {
      const grown = new Uint8Array(
        Math.min(Math.max(needed, this.#buffer.byteLength * 2), this.#limit),
      )
      grown.set(this.#buffer.subarray(0, this.#length))
      this.#buffer = grown
    }
    this.#buffer.set(chunk, this.#length)
    this.#length = needed
    return true
  }

  result(): Uint8Array {
    return this.#buffer.subarray(0, this.#length)
  }
}
