import { describe, expect, it } from 'vitest'
import { GROUP_COUNT, type QuadGeometry } from '../../src/lib/models/bakeStates'
import { RenderLayer } from '../../src/lib/models/renderLayer'
import { faceShade, Mesher, type MesherState } from '../../src/lib/viewer/mesher'

const ALL = 0b111111
/** Normals of the six sides in FACES order. */
const NORMALS = [
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, -1],
  [0, 0, 1],
  [1, 0, 0],
  [-1, 0, 0],
]

function quad(side: number): QuadGeometry {
  return {
    quadCount: 1,
    positions: new Float32Array(12),
    uvs: new Float32Array(8),
    colors: new Float32Array(12).fill(1),
    normals: new Float32Array([
      ...NORMALS[side],
      ...NORMALS[side],
      ...NORMALS[side],
      ...NORMALS[side],
    ]),
  }
}

/** A cube with one quad per side in the given layer. */
function cube(layer: number, opaque: boolean): MesherState {
  const geometry = [0, 1, 2].map(() => new Array<QuadGeometry | null>(GROUP_COUNT).fill(null))
  for (let side = 0; side < 6; side++) geometry[layer][side] = quad(side)
  return { geometry, opaqueFaces: opaque ? ALL : 0, fullFaces: ALL, empty: false }
}

const AIR: MesherState = { geometry: [[], [], []], opaqueFaces: 0, fullFaces: 0, empty: true }
const STONE = cube(RenderLayer.Opaque, true)
const GLASS = cube(RenderLayer.Cutout, false)

function mesh(size: [number, number, number], blocks: number[], states: MesherState[]) {
  const mesher = new Mesher({
    size: { x: size[0], y: size[1], z: size[2] },
    blocks: new Uint16Array(blocks),
    states,
  })
  const counts = mesher.sectionCounts
  const quads = [0, 0, 0]
  for (let y = 0; y < counts.y; y++)
    for (let z = 0; z < counts.z; z++)
      for (let x = 0; x < counts.x; x++)
        mesher.meshSection(x, y, z).layers.forEach((l, i) => (quads[i] += l?.quadCount ?? 0))
  return { mesher, quads }
}

describe('Mesher', () => {
  it('draws all six faces of a lone block', () => {
    expect(mesh([1, 1, 1], [1], [AIR, STONE]).quads).toEqual([6, 0, 0])
  })

  it('drops faces between opaque blocks: a 2×2×2 solid shows only its 24 outer faces', () => {
    expect(mesh([2, 2, 2], new Array(8).fill(1), [AIR, STONE]).quads).toEqual([24, 0, 0])
  })

  it('keeps faces next to air', () => {
    expect(mesh([3, 1, 1], [1, 0, 1], [AIR, STONE]).quads).toEqual([12, 0, 0])
  })

  it('culls glass against glass but not against air', () => {
    expect(mesh([2, 1, 1], [1, 1], [AIR, GLASS]).quads).toEqual([0, 10, 0])
  })

  it('hides a glass face behind stone, but keeps the stone face behind glass', () => {
    // Block 0 = stone, block 1 = glass: stone's east face stays (glass is not opaque),
    // glass's west face goes (stone covers it).
    expect(mesh([2, 1, 1], [1, 2], [AIR, STONE, GLASS]).quads).toEqual([6, 5, 0])
  })

  it('splits the structure into 16³ sections and offsets positions', () => {
    const { mesher } = mesh([17, 1, 1], new Array(17).fill(1), [AIR, STONE])
    expect(mesher.sectionCounts).toEqual({ x: 2, y: 1, z: 1 })
    const second = mesher.meshSection(1, 0, 0).layers[RenderLayer.Opaque]!
    expect(second.quadCount).toBe(5) // its west face touches block 15
    expect(Math.min(...second.positions.filter((_, i) => i % 3 === 0))).toBe(16)
  })

  it('writes valid indices: two triangles per quad', () => {
    const layer = mesh([1, 1, 1], [1], [AIR, STONE]).mesher.meshSection(0, 0, 0).layers[0]!
    expect(layer.indices.length).toBe(36)
    expect(layer.indices).toBeInstanceOf(Uint16Array)
    expect(Math.max(...layer.indices)).toBe(23)
  })

  it('applies Minecraft face shading to the colors', () => {
    expect(faceShade(0, 1, 0)).toBe(1)
    expect(faceShade(0, -1, 0)).toBe(0.5)
    expect(faceShade(0, 0, 1)).toBe(0.8)
    expect(faceShade(1, 0, 0)).toBe(0.6)
    const layer = mesh([1, 1, 1], [1], [AIR, STONE]).mesher.meshSection(0, 0, 0).layers[0]!
    // Second quad is the down face (shade 0.5).
    expect(layer.colors[12]).toBe(128) // 0.5 as an 8-bit normalized value
  })
})

describe('Mesher caps', () => {
  // Column of three stone blocks: the faces between them are hidden.
  const column = () => mesh([1, 3, 1], [1, 1, 1], [AIR, STONE]).mesher

  it('returns the top faces of a level even when the level above hides them', () => {
    const cap = column().meshCap(1, 'up')
    expect(cap[0]!.quadCount).toBe(1)
    // The fixture quads sit at the block origin, so only the level offset shows.
    const ys = [...cap[0]!.positions].filter((_, i) => i % 3 === 1)
    expect(ys).toEqual([1, 1, 1, 1])
    // Normal meshing hides it: 4 sides per block plus the two ends.
    expect(column().meshSection(0, 0, 0).layers[0]!.quadCount).toBe(3 * 4 + 2)
  })

  it('returns the bottom faces of a level', () => {
    const cap = column().meshCap(2, 'down')
    expect(cap[0]!.quadCount).toBe(1)
    expect(cap[1]).toBeNull()
  })

  it('is empty for a level of air', () => {
    const mesher = mesh([1, 2, 1], [0, 1], [AIR, STONE]).mesher
    expect(mesher.meshCap(0, 'up')).toEqual([null, null, null])
  })
})
