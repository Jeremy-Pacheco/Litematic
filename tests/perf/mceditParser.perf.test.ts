/**
 * Time and memory of decoding a large MCEdit schematic.
 * Only runs with `pnpm test:perf` (needs `--expose-gc`).
 */
import { describe, expect, it } from 'vitest'
import legacy from '../../src/lib/data/legacyBlocks.json'
import { createLegacyTable } from '../../src/lib/parsers/mcedit/legacyBlocks'
import { parseMcEditWith } from '../../src/lib/parsers/mcedit/McEditParser'
import { readNbt } from '../../src/lib/parsers/nbt/NbtReader'
import { byteArray, encodeNbt, short, str } from '../helpers/nbt'

interface NodeGlobals {
  gc?: () => void
  process: { memoryUsage(): { heapUsed: number; arrayBuffers: number } }
}
const { gc, process } = globalThis as unknown as NodeGlobals
const MiB = 1024 * 1024

describe.skipIf(!gc)(
  'MCEdit decoding performance',
  () => {
    it('512 × 256 × 512 with random vanilla ids and metadata', () => {
      const [w, h, l] = [512, 256, 512]
      const volume = w * h * l
      const ids = new Uint8Array(volume)
      const metas = new Uint8Array(volume)
      for (let i = 0; i < volume; i += 65536) {
        crypto.getRandomValues(ids.subarray(i, i + 65536))
        crypto.getRandomValues(metas.subarray(i, i + 65536))
      }
      for (let i = 0; i < volume; i++) {
        ids[i] %= 200
        metas[i] &= 0x0f
      }
      const { root } = readNbt(
        encodeNbt({
          Width: short(w),
          Height: short(h),
          Length: short(l),
          Materials: str('Alpha'),
          Blocks: byteArray(ids),
          Data: byteArray(metas),
        }),
      )
      const table = createLegacyTable(legacy.blocks)

      gc!()
      const before = process.memoryUsage()
      const start = performance.now()
      const structure = parseMcEditWith(root, table)
      const ms = Math.round(performance.now() - start)
      gc!()
      const after = process.memoryUsage()
      console.log(
        `\n512×256×512: ${(volume / 1e6).toFixed(1)} M blocks → ${ms} ms ` +
          `(${Math.round(volume / ms / 1000)} M blocks/s), ${structure.palette.length} states, ` +
          `buffers +${Math.round((after.arrayBuffers - before.arrayBuffers) / MiB)} MiB, ` +
          `heap +${Math.round((after.heapUsed - before.heapUsed) / MiB)} MiB`,
      )
      expect(ms).toBeLessThan(8000)
    })
  },
  600_000,
)
