/**
 * Time and memory of decoding a large MCEdit schematic, including the passes
 * that compute neighbor-dependent states.
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
const [W, H, L] = [512, 256, 512]
const VOLUME = W * H * L

/** Fills ids and metas from random bytes with `pick(randomByte, i)`. */
function generate(pick: (r: number, ids: Uint8Array, metas: Uint8Array, i: number) => void) {
  const ids = new Uint8Array(VOLUME)
  const metas = new Uint8Array(VOLUME)
  const random = new Uint8Array(65536)
  for (let i = 0; i < VOLUME; i += 65536) {
    crypto.getRandomValues(random)
    for (let j = 0; j < 65536; j++) pick(random[j], ids, metas, i + j)
  }
  return { ids, metas }
}

function measure(label: string, ids: Uint8Array, metas: Uint8Array): void {
  const { root } = readNbt(
    encodeNbt({
      Width: short(W),
      Height: short(H),
      Length: short(L),
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
    `\n${label}: ${(VOLUME / 1e6).toFixed(1)} M blocks → ${ms} ms ` +
      `(${Math.round(VOLUME / ms / 1000)} M blocks/s), ${structure.palette.length} states, ` +
      `buffers +${Math.round((after.arrayBuffers - before.arrayBuffers) / MiB)} MiB, ` +
      `heap +${Math.round((after.heapUsed - before.heapUsed) / MiB)} MiB`,
  )
  expect(ms).toBeLessThan(8000)
}

/** Fence, stairs, glass pane, wall, redstone, door, chest. */
const NEIGHBOR_IDS = [85, 53, 102, 139, 55, 64, 54]

describe.skipIf(!gc)(
  'MCEdit decoding performance',
  () => {
    it('512 × 256 × 512 with random vanilla ids and metadata (worst case)', () => {
      // About a quarter of ids 0–199 need a neighbor rule.
      const { ids, metas } = generate((r, ids, metas, i) => {
        ids[i] = r % 200
        metas[i] = (r * 7) & 0x0f
      })
      measure('random', ids, metas)
    })

    it('512 × 256 × 512 with 5 % neighbor-dependent blocks', () => {
      // Half stone, about 5 % fences, stairs, panes, walls, dust, doors and
      // chests; the rest air.
      const { ids, metas } = generate((r, ids, metas, i) => {
        if (r < 13) {
          ids[i] = NEIGHBOR_IDS[r % NEIGHBOR_IDS.length]
          metas[i] = 2 + (i & 3)
        } else if (r < 141) {
          ids[i] = 1
        }
      })
      measure('5 %', ids, metas)
    })
  },
  600_000,
)
