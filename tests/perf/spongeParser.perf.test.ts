/**
 * Time and memory of decoding large Sponge schematics.
 * Only runs with `pnpm test:perf` (needs `--expose-gc`).
 */
import { describe, expect, it } from 'vitest'
import { readNbt } from '../../src/lib/parsers/nbt/NbtReader'
import { parseSponge } from '../../src/lib/parsers/sponge/SpongeParser'
import { byteArray, compound, encodeNbt, int, short } from '../helpers/nbt'

interface NodeGlobals {
  gc?: () => void
  process: { memoryUsage(): { heapUsed: number; arrayBuffers: number } }
}
const { gc, process } = globalThis as unknown as NodeGlobals
const MiB = 1024 * 1024

/**
 * Sponge v3 file of w × h × l with `paletteSize` states and random blocks.
 * Varints are written directly into a byte array (1 or 2 bytes each).
 */
function bigSponge(w: number, h: number, l: number, paletteSize: number): Uint8Array {
  const volume = w * h * l
  const random = new Uint8Array(volume * 2)
  for (let i = 0; i < random.length; i += 65536)
    crypto.getRandomValues(random.subarray(i, i + 65536))
  const data = new Uint8Array(volume * 2)
  let o = 0
  for (let i = 0; i < volume; i++) {
    const value = ((random[2 * i] << 8) | random[2 * i + 1]) % paletteSize
    if (value < 0x80) data[o++] = value
    else {
      data[o++] = (value & 0x7f) | 0x80
      data[o++] = value >> 7
    }
  }
  const palette = Object.fromEntries(
    Array.from({ length: paletteSize }, (_, i) => [
      i === 0 ? 'minecraft:air' : `minecraft:block_${i}`,
      int(i),
    ]),
  )
  return encodeNbt({
    Schematic: compound({
      Version: int(3),
      DataVersion: int(4325),
      Width: short(w),
      Height: short(h),
      Length: short(l),
      Blocks: compound({ Palette: compound(palette), Data: byteArray(data.subarray(0, o)) }),
    }),
  })
}

function measure(label: string, w: number, h: number, l: number, paletteSize: number): number {
  const { root } = readNbt(bigSponge(w, h, l, paletteSize))
  gc!()
  const before = process.memoryUsage()
  const start = performance.now()
  const structure = parseSponge(root)
  const ms = Math.round(performance.now() - start)
  gc!()
  const after = process.memoryUsage()
  const blocks = w * h * l
  console.log(
    `\n${label}: ${(blocks / 1e6).toFixed(1)} M blocks, ${paletteSize} states → ${ms} ms ` +
      `(${Math.round(blocks / ms / 1000)} M blocks/s), ` +
      `buffers +${Math.round((after.arrayBuffers - before.arrayBuffers) / MiB)} MiB, ` +
      `heap +${Math.round((after.heapUsed - before.heapUsed) / MiB)} MiB`,
  )
  expect(structure.blocks.length).toBe(blocks)
  return ms
}

describe.skipIf(!gc)(
  'Sponge decoding performance',
  () => {
    it('512 × 256 × 512, 100 states (1-byte varints)', () => {
      expect(measure('512×256×512', 512, 256, 512, 100)).toBeLessThan(8000)
    })

    it('512 × 256 × 512, 1000 states (mostly 2-byte varints)', () => {
      expect(measure('512×256×512', 512, 256, 512, 1000)).toBeLessThan(8000)
    })
  },
  600_000,
)
