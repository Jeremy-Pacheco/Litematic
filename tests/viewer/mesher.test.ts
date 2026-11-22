import { describe, expect, it } from 'vitest'
import { GROUP_COUNT, INNER_GROUP, type QuadGeometry } from '../../src/lib/models/bakeStates'
import type { FluidRender } from '../../src/lib/models/bakedTypes'
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
  return {
    geometry,
    opaqueFaces: opaque ? ALL : 0,
    fullFaces: ALL,
    empty: false,
    fluid: 0,
    fluidHeight: 0,
    fluidRender: null,
  }
}

const AIR: MesherState = {
  geometry: [[], [], []],
  opaqueFaces: 0,
  fullFaces: 0,
  empty: true,
  fluid: 0,
  fluidHeight: 0,
  fluidRender: null,
}
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

  it('splits the structure into 32 × 16 × 32 sections and offsets positions', () => {
    const { mesher } = mesh([33, 17, 1], new Array(33 * 17).fill(1), [AIR, STONE])
    expect(mesher.sectionCounts).toEqual({ x: 2, y: 2, z: 1 })
    // Last column of the bottom layers: its west face touches block 31.
    const second = mesher.meshSection(1, 0, 0).layers[RenderLayer.Opaque]!
    expect(Math.min(...second.positions.filter((_, i) => i % 3 === 0))).toBe(32)
    // Top row starts at layer 16.
    const top = mesher.meshSection(0, 1, 0).layers[RenderLayer.Opaque]!
    expect(Math.min(...top.positions.filter((_, i) => i % 3 === 1))).toBe(16)
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

describe('Mesher fluids', () => {
  const emptyLayers = () =>
    [0, 1, 2].map(() => new Array<QuadGeometry | null>(GROUP_COUNT).fill(null))

  /** Still and flowing textures in different halves of the atlas, to tell them apart. */
  const RENDER: FluidRender = {
    still: [0, 0, 0.5, 0.5],
    flow: [0.5, 0.5, 1, 1],
    color: [1, 1, 1],
    layer: RenderLayer.Translucent,
  }
  /** A state holding water (a source unless `height` says otherwise). */
  function withWater(model: MesherState, height = 8 / 9): MesherState {
    return { ...model, empty: false, fluid: 1, fluidHeight: height, fluidRender: RENDER }
  }
  /** Water itself: no model, only the fluid. */
  const water = (height?: number) => withWater({ ...AIR, geometry: emptyLayers() }, height)

  /** The translucent quads of a structure, as [x, y, z] corners, with their UVs (0–1). */
  function fluidQuads(size: [number, number, number], blocks: number[], states: MesherState[]) {
    const layer = mesh(size, blocks, states).mesher.meshSection(0, 0, 0).layers[
      RenderLayer.Translucent
    ]!
    return Array.from({ length: layer.quadCount }, (_, q) => ({
      corners: [0, 1, 2, 3].map((v) => [
        ...layer.positions.subarray((q * 4 + v) * 3, (q * 4 + v) * 3 + 3),
      ]),
      uvs: [...layer.uvs.subarray(q * 8, q * 8 + 8)].map((u) => u / 65535),
    }))
  }
  /** The surface quad of the block at (x, z): all corners above its floor, facing up. */
  const surface = (quads: ReturnType<typeof fluidQuads>, x: number, z: number) =>
    quads.find(
      (q) =>
        q.corners.every((c) => c[1] > 0.01) &&
        q.corners.every((c) => c[0] >= x && c[0] <= x + 1 && c[2] >= z && c[2] <= z + 1) &&
        new Set(q.corners.map((c) => c[0])).size === 2 &&
        new Set(q.corners.map((c) => c[2])).size === 2,
    )!
  /** Height of a surface corner at (x, z). */
  const at = (q: { corners: number[][] }, x: number, z: number) =>
    q.corners.find((c) => c[0] === x && c[2] === z)![1]
  /** A waterlogged plant (kelp, seagrass): a cutout model that covers no side. */
  const plant = (): MesherState => {
    const geometry = emptyLayers()
    geometry[RenderLayer.Cutout][INNER_GROUP] = quad(2)
    return withWater({ ...AIR, geometry, empty: false })
  }
  const quadsOf = (size: [number, number, number], blocks: number[], states: MesherState[]) =>
    mesh(size, blocks, states).quads
  const translucent = (size: [number, number, number], blocks: number[], states: MesherState[]) =>
    quadsOf(size, blocks, states)[RenderLayer.Translucent]

  it('hides the faces between water blocks', () => {
    expect(translucent([1, 1, 1], [1], [AIR, water()])).toBe(6)
    // Side by side: the shared sides disappear.
    expect(translucent([2, 1, 1], [1, 1], [AIR, water()])).toBe(10)
    // Stacked: lower block is full height without top, upper keeps its surface.
    expect(translucent([1, 2, 1], [1, 1], [AIR, water()])).toBe(10)
  })

  it('joins the water of waterlogged blocks with the water around them', () => {
    // Water (1) beside waterlogged glass (2): both waters lose the shared side.
    expect(quadsOf([2, 1, 1], [1, 2], [AIR, water(), withWater(GLASS)])).toEqual([0, 6, 10])
    // A column of kelp under water: one volume, the surface only at the top.
    // Water on top: 6 − bottom; each plant: 4 sides, the lowest one also its bottom.
    expect(quadsOf([1, 4, 1], [2, 2, 2, 1], [AIR, water(), plant()])).toEqual([0, 3, 5 + 13])
  })

  it('keeps the model faces of a waterlogged block next to water', () => {
    // The glass faces stay (water is not opaque); only its water is joined.
    expect(quadsOf([3, 1, 1], [1, 2, 1], [AIR, water(), withWater(GLASS)])[1]).toBe(6)
  })

  it('hides a fluid face behind an opaque block, but not next to air', () => {
    expect(translucent([2, 1, 1], [1, 2], [AIR, water(), STONE])).toBe(5)
    expect(translucent([2, 1, 1], [1, 0], [AIR, water()])).toBe(6)
  })

  it('keeps the full-height surface for a layer cut', () => {
    const mesher = mesh([1, 2, 1], [1, 1], [AIR, water()]).mesher
    const cap = mesher.meshCap(0, 'up')[RenderLayer.Translucent]!
    expect(cap.quadCount).toBe(1)
    // With water above, the cut shows the top of the block.
    for (let v = 0; v < 4; v++) expect(cap.positions[v * 3 + 1]).toBeCloseTo(1, 2)
    // Also under a waterlogged block.
    const wet = mesh([1, 2, 1], [1, 2], [AIR, water(), plant()]).mesher
    expect(wet.meshCap(0, 'up')[RenderLayer.Translucent]!.quadCount).toBe(1)
  })

  it('draws a still source flat at 8/9, with the still texture', () => {
    const top = surface(fluidQuads([1, 1, 1], [1], [AIR, water()]), 0, 0)
    for (const c of top.corners) expect(c[1]).toBeCloseTo(8 / 9, 2)
    // Every UV inside the still texture's rectangle.
    expect(top.uvs.every((u) => u <= 0.5 + 1e-4)).toBe(true)
  })

  it('slopes flowing water down from the source and turns the flow texture along it', () => {
    // Source at x = 0, flowing water (level 1: 7/9) at x = 1. Outside the
    // structure counts as unknown, so the far edge does not drop.
    const quads = fluidQuads([2, 1, 1], [1, 2], [AIR, water(), water(7 / 9)])
    const flowing = surface(quads, 1, 0)
    // Corners next to the source are pulled up by it (weighted average), the far ones stay at 7/9.
    expect(at(flowing, 1, 0)).toBeCloseTo((7 / 9 + (8 / 9) * 10) / 11, 2)
    expect(at(flowing, 2, 0)).toBeCloseTo(7 / 9, 2)
    expect(at(flowing, 1, 0)).toBeGreaterThan(at(flowing, 2, 0))
    // It flows: the flow texture (the other half of the atlas), not the still one.
    expect(flowing.uvs.every((u) => u >= 0.5 - 1e-4)).toBe(true)
    // The source's own corners meet the flowing water at the shared edge.
    expect(at(surface(quads, 0, 0), 1, 0)).toBeCloseTo(at(flowing, 1, 0), 2)
  })

  it('raises corners next to water with water above to the full block', () => {
    // Water at (0,0) and (1,0), with more water above (1,0): their shared corners reach 1.
    const quads = fluidQuads([2, 2, 1], [1, 1, 0, 1], [AIR, water()])
    const low = surface(quads, 0, 0)
    expect(at(low, 1, 0)).toBeCloseTo(1, 2)
    expect(at(low, 0, 0)).toBeCloseTo(8 / 9, 2)
  })

  it('cuts the side faces at the height of their corners', () => {
    const quads = fluidQuads([2, 1, 1], [1, 2], [AIR, water(), water(7 / 9)])
    // East side of the flowing block (x = 2): top at the far corners' height.
    const east = quads.find((q) => q.corners.every((c) => c[0] === 2))!
    expect(Math.max(...east.corners.map((c) => c[1]))).toBeCloseTo(7 / 9, 2)
    expect(Math.min(...east.corners.map((c) => c[1]))).toBe(0)
  })
})
