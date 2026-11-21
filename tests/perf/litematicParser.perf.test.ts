/**
 * Time and memory of decoding large Litematica regions.
 * Only runs with `pnpm test:perf` (needs `--expose-gc`).
 */
import { describe, expect, it } from 'vitest'
import { parseLitematic } from '../../src/lib/parsers/litematic/LitematicParser'
import { readNbt } from '../../src/lib/parsers/nbt/NbtReader'
import { NbtType } from '../../src/lib/types/nbt'
import { litematicRoot } from '../helpers/litematic'
import { compound, encodeNbt, int, list, longArray, str } from '../helpers/nbt'

interface NodeGlobals {
  gc?: () => void
  process: { memoryUsage(): { heapUsed: number; arrayBuffers: number } }
}
const { gc, process } = globalThis as unknown as NodeGlobals
const MiB = 1024 * 1024

/** Region of `size` with a 256-state palette (8 bits) and random block data. */
function bigLitematic(sx: number, sy: number, sz: number): Uint8Array {
  const longs = Math.ceil((sx * sy * sz * 8) / 64)
  const bytes = new Uint8Array(longs * 8)
  for (let i = 0; i < bytes.length; i += 65536) crypto.getRandomValues(bytes.subarray(i, i + 65536))
  const values = Array.from(new BigInt64Array(bytes.buffer))
  const palette = Array.from({ length: 256 }, (_, i) =>
    compound({ Name: str(i === 0 ? 'minecraft:air' : `minecraft:block_${i}`) }),
  )
  const xyz = (x: number, y: number, z: number) => compound({ x: int(x), y: int(y), z: int(z) })
  return encodeNbt(
    litematicRoot({
      main: compound({
        Position: xyz(0, 0, 0),
        Size: xyz(sx, sy, sz),
        BlockStatePalette: list(NbtType.Compound, palette),
        BlockStates: longArray(values),
      }),
    }),
  )
}

function measure(label: string, sx: number, sy: number, sz: number) {
  const data = bigLitematic(sx, sy, sz)
  const { root } = readNbt(data)
  gc!()
  const before = process.memoryUsage()
  const start = performance.now()
  const structure = parseLitematic(root)
  const ms = Math.round(performance.now() - start)
  gc!()
  const after = process.memoryUsage()
  const blocks = sx * sy * sz
  console.log(
    `\n${label}: ${(blocks / 1e6).toFixed(1)} M blocks → ${ms} ms ` +
      `(${Math.round(blocks / ms / 1000)} M blocks/s), ` +
      `buffers +${Math.round((after.arrayBuffers - before.arrayBuffers) / MiB)} MiB, ` +
      `heap +${Math.round((after.heapUsed - before.heapUsed) / MiB)} MiB`,
  )
  expect(structure.blocks.length).toBe(blocks)
  return ms
}

describe.skipIf(!gc)(
  'Litematica decoding performance',
  () => {
    it('256 × 256 × 256 (16.8 M blocks)', () => {
      expect(measure('256×256×256', 256, 256, 256)).toBeLessThan(2000)
    })

    it('512 × 256 × 512 (67.1 M blocks)', () => {
      expect(measure('512×256×512', 512, 256, 512)).toBeLessThan(8000)
    })
  },
  600_000,
)
