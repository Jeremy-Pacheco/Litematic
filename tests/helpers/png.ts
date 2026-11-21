/**
 * Minimal PNG decoder for tests (Node has no `createImageBitmap`): 8-bit
 * grey, RGB, RGBA and grey + alpha, and palette images of 1–8 bits with
 * `tRNS` transparency, without interlacing. Enough for the game's font sheets.
 */
import type { FontSheet } from '../../src/lib/models/signFont'

interface NodeZlib {
  inflateSync(data: Uint8Array): Uint8Array
}
const zlib = (
  globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }
).process.getBuiltinModule('node:zlib') as NodeZlib

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

export async function decodePng(bytes: Uint8Array): Promise<FontSheet> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 8
  let width = 0
  let height = 0
  let depth = 0
  let type = 0
  let palette: Uint8Array = new Uint8Array(0)
  let alpha: Uint8Array = new Uint8Array(0)
  const data: Uint8Array[] = []
  while (offset < bytes.length) {
    const length = view.getUint32(offset)
    const name = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
    const body = bytes.subarray(offset + 8, offset + 8 + length)
    if (name === 'IHDR') {
      width = view.getUint32(offset + 8)
      height = view.getUint32(offset + 12)
      depth = body[8]
      type = body[9]
      if (body[12] !== 0) throw new Error('Interlaced PNG')
    } else if (name === 'PLTE') palette = body
    else if (name === 'tRNS') alpha = body
    else if (name === 'IDAT') data.push(body)
    else if (name === 'IEND') break
    offset += 12 + length
  }
  const channels = CHANNELS[type]
  if (!channels || (type !== 3 && depth !== 8)) throw new Error(`Unsupported PNG ${type}/${depth}`)
  const joined = new Uint8Array(data.reduce((n, d) => n + d.length, 0))
  data.reduce((at, d) => (joined.set(d, at), at + d.length), 0)
  const raw = zlib.inflateSync(joined)

  const bitsPerPixel = channels * depth
  const stride = Math.ceil((width * bitsPerPixel) / 8)
  const bpp = Math.max(1, bitsPerPixel / 8)
  const rows = new Uint8Array(stride * height)
  let previous = new Uint8Array(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const out = rows.subarray(y * stride, (y + 1) * stride)
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[i - bpp] : 0
      const b = previous[i]
      const c = i >= bpp ? previous[i - bpp] : 0
      const p = a + b - c
      const paeth =
        Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c)
          ? a
          : Math.abs(p - b) <= Math.abs(p - c)
            ? b
            : c
      const predictor = [0, a, b, (a + b) >> 1, paeth][filter]
      out[i] = (line[i] + predictor) & 0xff
    }
    previous = out
  }

  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4
      if (type === 3) {
        const bit = x * depth
        const index =
          (rows[y * stride + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1)
        pixels.set(palette.subarray(index * 3, index * 3 + 3), o)
        pixels[o + 3] = index < alpha.length ? alpha[index] : 255
      } else {
        const s = y * stride + x * channels
        const grey = type === 0 || type === 4
        pixels[o] = rows[s]
        pixels[o + 1] = grey ? rows[s] : rows[s + 1]
        pixels[o + 2] = grey ? rows[s] : rows[s + 2]
        pixels[o + 3] = type === 4 ? rows[s + 1] : type === 6 ? rows[s + 3] : 255
      }
    }
  }
  return { width, height, pixels }
}
