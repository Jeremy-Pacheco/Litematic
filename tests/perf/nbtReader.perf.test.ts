/**
 * Memory and time of reading large block arrays: Deepslate vs. our reader.
 *
 * Only runs with `pnpm test:perf` (needs `--expose-gc` to measure memory);
 * skipped in the normal test run.
 */
import { NbtFile } from 'deepslate/nbt'
import { describe, expect, it } from 'vitest'
import { readNbt } from '../../src/lib/parsers/nbt/NbtReader'
import { ByteWriter } from '../helpers/nbt'

// Node globals, typed locally: the test tsconfig targets the browser.
interface NodeGlobals {
  gc?: () => void
  process: { memoryUsage(): { heapUsed: number; arrayBuffers: number } }
}
const { gc, process } = globalThis as unknown as NodeGlobals
const MiB = 1024 * 1024

/** Root compound with one ByteArray (Sponge `BlockData`, 1 byte per block). */
function byteArrayFile(length: number): Uint8Array {
  const payload = new Uint8Array(length)
  for (let i = 0; i < length; i++) payload[i] = i % 7
  return new ByteWriter()
    .u8(10)
    .string('')
    .u8(7)
    .string('BlockData')
    .i32(length)
    .bytes(payload)
    .u8(0)
    .result()
}

/** Root compound with one LongArray (Litematica `BlockStates`). */
function longArrayFile(length: number): Uint8Array {
  const payload = new Uint8Array(length * 8)
  for (let i = 0; i < payload.length; i++) payload[i] = (i * 31) & 0xff
  return new ByteWriter()
    .u8(10)
    .string('')
    .u8(12)
    .string('BlockStates')
    .i32(length)
    .bytes(payload)
    .u8(0)
    .result()
}

interface Measurement {
  ms: number
  heapMiB: number
  buffersMiB: number
}

function measure(parse: () => unknown): Measurement {
  gc!()
  const before = process.memoryUsage()
  const start = performance.now()
  const result = parse()
  const ms = performance.now() - start
  gc!()
  const after = process.memoryUsage()
  // Using the result here keeps it alive during the second measurement.
  expect(result).toBeTruthy()
  return {
    ms: Math.round(ms),
    heapMiB: Math.round((after.heapUsed - before.heapUsed) / MiB),
    buffersMiB: Math.round((after.arrayBuffers - before.arrayBuffers) / MiB),
  }
}

function report(label: string, inputMiB: number, ours: Measurement, theirs: Measurement | string) {
  const fmt = (m: Measurement | string) =>
    typeof m === 'string' ? m : `${m.ms} ms, heap +${m.heapMiB} MiB, buffers +${m.buffersMiB} MiB`
  console.log(
    `\n${label} (input ${inputMiB} MiB)\n  ours:      ${fmt(ours)}\n  deepslate: ${fmt(theirs)}`,
  )
}

describe.skipIf(!gc)(
  'NBT reader performance',
  () => {
    it('ByteArray of 16 Mi blocks (Sponge, 256×256×256)', () => {
      const data = byteArrayFile(16 * MiB)
      const ours = measure(() => readNbt(data))
      const theirs = measure(() => NbtFile.read(data, { compression: 'none' }))
      report('ByteArray 16 Mi', 16, ours, theirs)
      expect(ours.heapMiB).toBeLessThan(theirs.heapMiB)
    })

    it('LongArray of 2 Mi longs (Litematica, 16 Mi blocks at 8 bits)', () => {
      const data = longArrayFile(2 * MiB)
      const ours = measure(() => readNbt(data))
      const theirs = measure(() => NbtFile.read(data, { compression: 'none' }))
      report('LongArray 2 Mi', 16, ours, theirs)
      expect(ours.heapMiB + ours.buffersMiB).toBeLessThan(theirs.heapMiB + theirs.buffersMiB)
    })

    it('ByteArray of 64 Mi blocks (Sponge, 512×256×512): our reader only', () => {
      const data = byteArrayFile(64 * MiB)
      const ours = measure(() => readNbt(data))
      report('ByteArray 64 Mi', 64, ours, 'not run (extrapolated from 16 Mi)')
      expect(ours.ms).toBeLessThan(1000)
    })
  },
  600_000,
)
