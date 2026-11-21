/**
 * Checks that sign text lands on the board that is actually drawn: the
 * game's JSON models (real client.jar 26.3, git-ignored local fixture,
 * skipped when absent) and Deepslate's special renderers (used when the game
 * files have no sign models; no jar needed).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { readClientJar } from '../../src/lib/assets/minecraftJar'
import { bakeState, type BakeAtlas, type BakedState } from '../../src/lib/models/bakeStates'
import { GameResources } from '../../src/lib/models/gameResources'
import { parseBlockStateString } from '../../src/lib/parsers/blockStateString'
import { signPlacement } from '../../src/lib/viewer/signText'
import { signTextCorners } from '../../src/lib/viewer/signTextMeshes'

interface NodeFs {
  existsSync(path: string): boolean
  readFileSync(path: string): Uint8Array
}
const { getBuiltinModule } = (
  globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }
).process
const fs = getBuiltinModule('node:fs') as NodeFs
const JAR = 'tests/fixtures/local/client-26.3.jar'

/** Every texture covers the whole atlas, so UVs are the model's UVs / 16. */
const atlas: BakeAtlas = {
  getTextureAtlas: () => {
    throw new Error('not used')
  },
  getTextureUV: () => [0, 0, 1, 1],
  layerAt: () => 0,
}

type V = [number, number, number]
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: V, b: V): V => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const unit = (a: V): V => {
  const l = Math.hypot(...a)
  return [a[0] / l, a[1] / l, a[2] / l]
}

interface BoardFace {
  corners: V[]
  normal: V
  u: number[]
  v: number[]
}

/** The two big faces of the board (largest vertical quads of the model). */
function boardFaces(baked: BakedState): BoardFace[] {
  const faces: (BoardFace & { area: number })[] = []
  for (const g of baked.geometry.flat()) {
    if (!g) continue
    for (let q = 0; q < g.quadCount; q++) {
      const corners = [0, 1, 2, 3].map(
        (k) => [...g.positions.subarray(q * 12 + k * 3, q * 12 + k * 3 + 3)] as V,
      )
      const normal = [...g.normals.subarray(q * 12, q * 12 + 3)] as V
      if (Math.abs(normal[1]) > 0.1) continue
      const area = Math.hypot(...cross(sub(corners[1], corners[0]), sub(corners[3], corners[0])))
      const uvs = [...g.uvs.subarray(q * 8, q * 8 + 8)]
      faces.push({
        corners,
        normal,
        area,
        u: uvs.filter((_, i) => i % 2 === 0),
        v: uvs.filter((_, i) => i % 2 === 1),
      })
    }
  }
  faces.sort((a, b) => b.area - a.area)
  return faces.slice(0, 2)
}

/** Checks the text of one side and returns the board face it lies on. */
function faceUnderText(text: V[], faces: BoardFace[], label: string): BoardFace {
  const [tl, tr, , bl] = text
  // Seen by the reader: right × up points towards them, and up is up.
  const normal = unit(cross(sub(tr, tl), sub(tl, bl)))
  expect(tl[1], `${label}: upright`).toBeGreaterThan(bl[1])
  const face = faces.find((f) => dot(f.normal, normal) > 0.999)
  expect(face, `${label}: a board face looks the same way`).toBeDefined()
  // Every text corner sits on a corner of that face, just in front of it.
  for (const corner of text) {
    const gap = Math.min(...face!.corners.map((c) => Math.hypot(...sub(corner, c))))
    expect(gap, `${label}: corner on the board`).toBeLessThan(0.01)
    const lift = dot(sub(corner, face!.corners[0]), face!.normal)
    expect(lift, `${label}: in front of the board`).toBeGreaterThan(0)
  }
  return face!
}

const STANDING = Array.from({ length: 16 }, (_, r) => r)
const FACINGS = ['north', 'south', 'east', 'west']

/** Sign states to check, with how to tell their front face from its texture. */
function cases(special: boolean): { text: string; front: ((f: BoardFace) => boolean) | null }[] {
  // Game models: front text area at the top of the texture (v < 0.45).
  // Deepslate: on the left of the entity texture (u < 0.42).
  const front = special
    ? (f: BoardFace) => Math.max(...f.u) < 0.42
    : (f: BoardFace) => Math.max(...f.v) < 0.45
  return [
    ...STANDING.map((r) => ({ text: `minecraft:oak_sign[rotation=${r}]`, front })),
    ...FACINGS.map((f) => ({ text: `minecraft:oak_wall_sign[facing=${f}]`, front })),
    // The two faces of a hanging sign look the same.
    ...STANDING.flatMap((r) =>
      ['false', 'true'].map((attached) => ({
        text: `minecraft:oak_hanging_sign[attached=${attached},rotation=${r}]`,
        front: null,
      })),
    ),
    ...FACINGS.map((f) => ({ text: `minecraft:oak_wall_hanging_sign[facing=${f}]`, front: null })),
  ]
}

/**
 * Known gap: the 26.x model of unattached hanging signs at rotations 3, 7,
 * 11 and 15 turns an element with x/y/z angles, which Deepslate cannot read,
 * so they are drawn as missing-model cubes. To be fixed in its own branch.
 */
const UNREADABLE_GAME_MODEL = /hanging_sign\[attached=false,rotation=(3|7|11|15)\]/

function checkAll(resources: GameResources, special: boolean): void {
  for (const { text, front } of cases(special)) {
    if (!special && UNREADABLE_GAME_MODEL.test(text)) continue
    const state = parseBlockStateString(text)!
    const baked = bakeState(state, resources, atlas)
    expect(baked.specialModel, text).toBe(special)
    const faces = boardFaces(baked)
    const placement = signPlacement(state, special)!
    const pos = { x: 0, y: 0, z: 0 }
    const frontFace = faceUnderText(signTextCorners(pos, placement, false), faces, `${text} front`)
    const backFace = faceUnderText(signTextCorners(pos, placement, true), faces, `${text} back`)
    expect(frontFace, text).not.toBe(backFace)
    if (front) {
      expect(front(frontFace), `${text}: front text on the front face`).toBe(true)
      expect(front(backFace), `${text}: back text on the back face`).toBe(false)
    }
  }
}

describe('sign text on Deepslate boards (game files without sign models)', () => {
  it('lands on the drawn board, both sides, every rotation', () => {
    checkAll(new GameResources(new Map()), true)
  })
})

describe.skipIf(!fs.existsSync(JAR))('sign text on the game models of client.jar 26.3', () => {
  // Read in beforeAll: a skipped suite still runs its body to collect tests.
  let resources!: GameResources
  beforeAll(() => {
    resources = new GameResources(readClientJar(new Uint8Array(fs.readFileSync(JAR))).files)
  })

  it('lands on the drawn board, both sides, every rotation', () => {
    checkAll(resources, false)
  })

  it('shows the front where the game does', () => {
    // A sign placed facing north shows its front to the south (rotation 0),
    // and a wall sign shows it towards its facing.
    const normalOf = (text: string) => {
      const [tl, tr, , bl] = signTextCorners(
        { x: 0, y: 0, z: 0 },
        signPlacement(parseBlockStateString(text)!)!,
        false,
      )
      return unit(cross(sub(tr, tl), sub(tl, bl))).map((c) => Math.round(c) + 0)
    }
    expect(normalOf('minecraft:oak_sign[rotation=0]')).toEqual([0, 0, 1])
    expect(normalOf('minecraft:oak_sign[rotation=4]')).toEqual([-1, 0, 0])
    expect(normalOf('minecraft:oak_wall_sign[facing=east]')).toEqual([1, 0, 0])
    expect(normalOf('minecraft:oak_hanging_sign[attached=false,rotation=8]')).toEqual([0, 0, -1])
    expect(normalOf('minecraft:oak_wall_hanging_sign[facing=west]')).toEqual([-1, 0, 0])
  })
})
