import { beforeAll, describe, expect, it } from 'vitest'
import { readClientJar } from '../../src/lib/assets/minecraftJar'
import type { AtlasAnimation } from '../../src/lib/models/atlas'
import { animationLength, animationSteps, frameAt } from '../../src/lib/models/textureAnimation'
import { AnimationClock } from '../../src/lib/viewer/atlasAnimation'

describe('animationSteps', () => {
  it('plays every frame in order, one tick each, by default', () => {
    expect(animationSteps({ animation: {} }, 3)).toEqual([
      { frame: 0, ticks: 1 },
      { frame: 1, ticks: 1 },
      { frame: 2, ticks: 1 },
    ])
  })

  it('reads frametime and an explicit order with per-frame times', () => {
    expect(
      animationSteps({ animation: { frametime: 2, frames: [0, { index: 2, time: 5 }, 1] } }, 3),
    ).toEqual([
      { frame: 0, ticks: 2 },
      { frame: 2, ticks: 5 },
      { frame: 1, ticks: 2 },
    ])
  })

  it('skips invalid entries and gives up when nothing would move', () => {
    expect(animationSteps({ animation: { frames: [0, 9, -1, 'x', { index: 1 }] } }, 2)).toEqual([
      { frame: 0, ticks: 1 },
      { frame: 1, ticks: 1 },
    ])
    expect(animationSteps({ animation: { frames: [0, 0] } }, 2)).toBeNull()
    expect(animationSteps({ animation: {} }, 1)).toBeNull()
    expect(animationSteps({}, 4)).toBeNull()
    expect(animationSteps(null, 4)).toBeNull()
  })
})

describe('frameAt', () => {
  const steps = [
    { frame: 0, ticks: 2 },
    { frame: 3, ticks: 1 },
  ]
  it('follows the steps and loops', () => {
    expect(animationLength(steps)).toBe(3)
    expect([0, 1, 2, 3, 4, 5].map((t) => frameAt(steps, t))).toEqual([0, 0, 3, 0, 0, 3])
    expect(frameAt(steps, 2.9)).toBe(3)
  })
})

describe('AnimationClock', () => {
  const animation = (steps: AtlasAnimation['steps'], frames: number): AtlasAnimation => ({
    target: { x: 0, y: 0, width: 18, height: 18 },
    frames: Array.from({ length: frames }, (_, i) => ({ x: i * 18, y: 0 })),
    steps,
  })

  it('copies only the animations whose frame changes', () => {
    const slow = animation(
      [
        { frame: 0, ticks: 2 },
        { frame: 1, ticks: 2 },
      ],
      2,
    )
    const fast = animation(
      [
        { frame: 0, ticks: 1 },
        { frame: 1, ticks: 1 },
      ],
      2,
    )
    const clock = new AnimationClock([slow, fast])
    const copies: string[] = []
    const copy = (a: AtlasAnimation, cell: { x: number }) =>
      copies.push(`${a === slow ? 'slow' : 'fast'}:${cell.x / 18}`)

    // First tick: everything is copied once.
    expect(clock.advance(0, copy)).toBe(true)
    expect(copies.splice(0)).toEqual(['slow:0', 'fast:0'])
    // Same tick again: nothing to do, no redraw.
    expect(clock.advance(0.5, copy)).toBe(false)
    expect(clock.advance(1, copy)).toBe(true)
    expect(copies.splice(0)).toEqual(['fast:1'])
    expect(clock.advance(2, copy)).toBe(true)
    expect(copies.splice(0)).toEqual(['slow:1', 'fast:0'])
    // After a reset (atlas uploaded again) the current frames are copied again.
    clock.reset()
    clock.advance(2, copy)
    expect(copies.splice(0)).toEqual(['slow:1', 'fast:0'])
  })
})

interface NodeFs {
  existsSync(path: string): boolean
  readFileSync(path: string): Uint8Array
}
const fs = (
  globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }
).process.getBuiltinModule('node:fs') as NodeFs
const JAR = 'tests/fixtures/local/client-26.3.jar'

describe.skipIf(!fs.existsSync(JAR))('the animations of client.jar 26.3', () => {
  // Read in beforeAll: a skipped suite still runs its body to collect tests.
  let files!: Map<string, Uint8Array>
  beforeAll(() => {
    files = readClientJar(new Uint8Array(fs.readFileSync(JAR))).files
  })
  const steps = (name: string) => {
    const path = `assets/minecraft/textures/block/${name}.png`
    const png = files.get(path)!
    // PNG width and height are big-endian at bytes 16 and 20.
    const view = new DataView(png.buffer, png.byteOffset)
    const frames = view.getUint32(20) / view.getUint32(16)
    const mcmeta = JSON.parse(new TextDecoder().decode(files.get(`${path}.mcmeta`)))
    return animationSteps(mcmeta, frames)
  }

  it('animates water and lava, still and flowing', () => {
    for (const name of ['water_still', 'water_flow', 'lava_still', 'lava_flow']) {
      const s = steps(name)
      expect(s, name).not.toBeNull()
      expect(new Set(s!.map((x) => x.frame)).size, name).toBeGreaterThan(1)
    }
    // Water changes frame every 2 ticks: 10 times per second.
    expect(steps('water_still')![0].ticks).toBe(2)
  })
})
