import { beforeAll, describe, expect, it } from 'vitest'
import { readClientJar } from '../../src/lib/assets/minecraftJar'
import { bakeState, type BakeAtlas, type BakedState } from '../../src/lib/models/bakeStates'
import { normalizeElementRotations, singleAxisRotation } from '../../src/lib/models/elementRotation'
import { GameResources } from '../../src/lib/models/gameResources'
import { parseBlockStateString } from '../../src/lib/parsers/blockStateString'

describe('singleAxisRotation', () => {
  it('keeps single-axis turns', () => {
    expect(singleAxisRotation(0, 30, 0)).toEqual({ axis: 'y', angle: 30 })
    expect(singleAxisRotation(45, 0, 0)).toEqual({ axis: 'x', angle: 45 })
    expect(singleAxisRotation(0, 0, -22.5)).toEqual({ axis: 'z', angle: -22.5 })
  })

  it('reduces x 180 + z 180 around y (the 26.x hanging sign)', () => {
    // Turning 180° around x and z is a half turn around y: y −67.5 becomes −112.5.
    expect(singleAxisRotation(180, -67.5, -180)).toEqual({ axis: 'y', angle: -112.5 })
  })

  it('gives up when no single axis matches', () => {
    expect(singleAxisRotation(30, 30, 0)).toBeNull()
  })
})

describe('normalizeElementRotations', () => {
  it('rewrites per-axis rotations and keeps origin and rescale', () => {
    const json = {
      parent: 'block/block',
      elements: [
        { from: [0, 0, 0], to: [1, 1, 1] },
        { rotation: { angle: 45, axis: 'y', origin: [8, 0, 8] } },
        { rotation: { x: 180, y: -67.5, z: -180, origin: [8, 0, 8], rescale: true } },
      ],
    }
    const out = normalizeElementRotations(json) as typeof json
    expect(out.elements[2].rotation).toEqual({
      axis: 'y',
      angle: -112.5,
      origin: [8, 0, 8],
      rescale: true,
    })
    expect(out.elements[0]).toBe(json.elements[0])
    expect(out.elements[1]).toBe(json.elements[1])
    expect(out.parent).toBe('block/block')
    // The input is not changed.
    expect(json.elements[2].rotation).toHaveProperty('x', 180)
  })

  it('returns the same object when there is nothing to rewrite', () => {
    const plain = { elements: [{ rotation: { angle: 0, axis: 'x', origin: [0, 0, 0] } }] }
    expect(normalizeElementRotations(plain)).toBe(plain)
    const unreadable = { elements: [{ rotation: { x: 30, y: 30, origin: [0, 0, 0] } }] }
    expect(normalizeElementRotations(unreadable)).toBe(unreadable)
    const bad = { elements: [{ rotation: { x: 'a', origin: [0, 0, 0] } }] }
    expect(normalizeElementRotations(bad)).toBe(bad)
    expect(normalizeElementRotations(null)).toBeNull()
  })
})

interface NodeFs {
  existsSync(path: string): boolean
  readFileSync(path: string): Uint8Array
}
const { getBuiltinModule } = (
  globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }
).process
const fs = getBuiltinModule('node:fs') as NodeFs
const JAR = 'tests/fixtures/local/client-26.3.jar'

const atlas: BakeAtlas = {
  getTextureAtlas: () => {
    throw new Error('not used')
  },
  getTextureUV: () => [0, 0, 1, 1],
  layerAt: () => 0,
}

/** Vertex positions of a baked state, turned around the block's vertical axis. */
function vertices(baked: BakedState, degrees = 0): string[] {
  const r = (degrees * Math.PI) / 180
  const out: string[] = []
  for (const g of baked.geometry.flat()) {
    for (let i = 0; g && i < g.positions.length; i += 3) {
      const x = g.positions[i] - 0.5
      const z = g.positions[i + 2] - 0.5
      // Same convention as a model's y rotation (right-handed).
      const rx = x * Math.cos(r) + z * Math.sin(r) + 0.5
      const rz = -x * Math.sin(r) + z * Math.cos(r) + 0.5
      out.push(
        [rx, g.positions[i + 1], rz]
          .map((v) => (Math.round(v * 1000) / 1000 + 0).toFixed(3))
          .join(','),
      )
    }
  }
  return out.sort()
}

describe.skipIf(!fs.existsSync(JAR))('per-axis rotations in client.jar 26.3', () => {
  // Read in beforeAll: a skipped suite still runs its body to collect tests.
  let resources!: GameResources
  beforeAll(() => {
    resources = new GameResources(readClientJar(new Uint8Array(fs.readFileSync(JAR))).files)
  })
  const bake = (text: string) => bakeState(parseBlockStateString(text)!, resources, atlas)

  it('draws every hanging sign rotation with its model', () => {
    for (let r = 0; r < 16; r++) {
      const text = `minecraft:oak_hanging_sign[attached=false,rotation=${r}]`
      expect(bake(text).missing, text).toBe(false)
    }
  })

  it('turns the rotation 3 hanging sign like the others (rotation 0 turned −67.5°)', () => {
    const rotation0 = bake('minecraft:oak_hanging_sign[attached=false,rotation=0]')
    const rotation3 = bake('minecraft:oak_hanging_sign[attached=false,rotation=3]')
    expect(vertices(rotation3)).toEqual(vertices(rotation0, -67.5))
  })
})
