import { BlockState as DsBlockState, Identifier } from 'deepslate/core'
import {
  BlockColors,
  BlockModel,
  Mesh,
  SpecialRenderers,
  type Quad,
  type TextureAtlasProvider,
} from 'deepslate/render'
import { NbtCompound, NbtList, NbtString } from 'deepslate/nbt'
import { isAirId } from '../parsers/blockState'
import type { BlockRenderData } from './blockEntityRender'
import type { BlockState } from '../types/structure'
import type { GameResources } from './gameResources'
import {
  FACES,
  FLUID_LAVA,
  FLUID_NONE,
  FLUID_WATER,
  GROUP_COUNT,
  INNER_GROUP,
  MISSING_TEXTURE,
  type BakedState,
  type FluidRender,
  type QuadGeometry,
} from './bakedTypes'
import { RENDER_LAYERS, RenderLayer } from './renderLayer'

/**
 * "Bakes" each state of a structure palette into ready-to-mesh geometry:
 * quads in block space (0–1), grouped by render layer and by the side of the
 * block they lie on, so the mesher can drop the faces hidden by a neighbor
 * without looking at models again. Done once per palette state, not per block.
 */

export {
  FACES,
  GROUP_COUNT,
  INNER_GROUP,
  MISSING_TEXTURE,
  type BakedState,
  type Face,
  type QuadGeometry,
} from './bakedTypes'

/** An atlas the baker can query: UVs (deepslate interface) and render layers. */
export interface BakeAtlas extends TextureAtlasProvider {
  /** Render layer of the texture at normalized atlas coordinates. */
  layerAt(u: number, v: number): RenderLayer
}

export interface BakeResult {
  states: BakedState[]
  /** Block ids that had no model (unique, sorted). */
  missingBlocks: string[]
}

const EPS = 1e-4

/** Texture ids referenced by a palette, found with a recording atlas. */
export function collectTextureIds(
  palette: readonly BlockState[],
  resources: GameResources,
  data: readonly (BlockRenderData | null)[] = [],
): Set<string> {
  const ids = new Set<string>([MISSING_TEXTURE])
  const recorder: TextureAtlasProvider = {
    getTextureAtlas: () => {
      throw new Error('Not available while recording')
    },
    getTextureUV(id: Identifier) {
      ids.add(id.toString())
      return [0, 0, 1, 1]
    },
  }
  palette.forEach((state, i) => {
    meshOf(state, resources, recorder, {}, data[i] ?? null)
    for (const id of fluidTextures(fluidOf(state)) ?? []) ids.add(id.toString())
  })
  return ids
}

export function bakePalette(
  palette: readonly BlockState[],
  resources: GameResources,
  atlas: BakeAtlas,
  data: readonly (BlockRenderData | null)[] = [],
): BakeResult {
  const missing = new Set<string>()
  const states = palette.map((state, i) => {
    const baked = bakeState(state, resources, atlas, data[i] ?? null)
    if (baked.missing) missing.add(state.name)
    return baked
  })
  return { states, missingBlocks: [...missing].sort() }
}

export function bakeState(
  state: BlockState,
  resources: GameResources,
  atlas: BakeAtlas,
  data: BlockRenderData | null = null,
): BakedState {
  if (isAirId(state.name)) return emptyState()
  const model = meshOf(state, resources, atlas, {}, data)
  // The fluid a block holds is drawn apart from its model: the mesher builds
  // its shape from the neighbours (sloped surface, faces hidden next to the
  // same fluid), as the game does.
  const fluid = fluidOf(state)
  const fluidRender = fluidRenderOf(fluid, atlas)
  const missing = model === null && !FLUID_BLOCKS.has(state.name)
  const quads = missing ? missingCube(atlas) : (model?.mesh.quads ?? [])
  return {
    ...sortQuads(quads, atlas),
    missing,
    specialModel: model?.special ?? false,
    empty: quads.length === 0 && fluidRender === null,
    fluid,
    fluidHeight: fluidHeightOf(state, fluid),
    fluidRender,
  }
}

/** Texture ids of a fluid: still and flowing. */
function fluidTextures(fluid: number): [Identifier, Identifier] | null {
  if (fluid === FLUID_NONE) return null
  const name = fluid === FLUID_LAVA ? 'lava' : 'water'
  return [Identifier.create(`block/${name}_still`), Identifier.create(`block/${name}_flow`)]
}

/** Atlas rectangles, tint and layer of a fluid. */
function fluidRenderOf(fluid: number, atlas: BakeAtlas): FluidRender | null {
  const textures = fluidTextures(fluid)
  if (!textures) return null
  // Same small inset towards the centre as model UVs (see `UV_INSET_PIXELS`).
  const inset = (atlas.getPixelSize?.() ?? 0) * UV_INSET_PIXELS
  const [still, flow] = textures.map((id) => {
    const [u0, v0, u1, v1] = atlas.getTextureUV(id)
    return [u0 + inset, v0 + inset, u1 - inset, v1 - inset] as FluidRender['still']
  })
  const tint = fluid === FLUID_WATER ? BlockColors.water?.({}) : undefined
  return {
    still,
    flow,
    color: tint ? [tint[0], tint[1], tint[2]] : [1, 1, 1],
    layer: atlas.layerAt((still[0] + still[2]) / 2, (still[1] + still[3]) / 2),
  }
}

/**
 * The game's own height of the fluid in a block (`FluidState.getOwnHeight`):
 * amount / 9, where a source or falling fluid has 8 and flowing fluid
 * `8 - level`. Waterlogged blocks hold a source.
 */
export function fluidHeightOf(state: BlockState, fluid: number): number {
  if (fluid === FLUID_NONE) return 0
  if (!FLUID_BLOCKS.has(state.name)) return 8 / 9
  const level = Number(state.properties.level ?? 0)
  const amount = Number.isInteger(level) && level >= 1 && level < 8 ? 8 - level : 8
  return amount / 9
}

const FLUID_BLOCKS = new Map([
  ['minecraft:water', FLUID_WATER],
  ['minecraft:lava', FLUID_LAVA],
])
/** Blocks that are always under water without a `waterlogged` property. */
const ALWAYS_WATER = new Set([
  'minecraft:bubble_column',
  'minecraft:kelp',
  'minecraft:kelp_plant',
  'minecraft:seagrass',
  'minecraft:tall_seagrass',
])

/** The same block state without water (`waterlogged=false`). */
function dry(state: DsBlockState): DsBlockState {
  const properties = state.getProperties()
  return properties.waterlogged === 'true'
    ? new DsBlockState(state.getName(), { ...properties, waterlogged: 'false' })
    : state
}

/** Fluid filling the position of a state (see `BakedState.fluid`). */
export function fluidOf(state: BlockState): number {
  const own = FLUID_BLOCKS.get(state.name)
  if (own !== undefined) return own
  if (state.properties.waterlogged === 'true' || ALWAYS_WATER.has(state.name)) return FLUID_WATER
  return FLUID_NONE
}

/** Groups quads by render layer and side, and measures which sides they cover. */
function sortQuads(
  quads: Quad[],
  atlas: BakeAtlas,
): Pick<BakedState, 'geometry' | 'opaqueFaces' | 'fullFaces'> {
  // quads[layer][group]
  const buckets: Quad[][][] = RENDER_LAYERS.map(() => Array.from({ length: GROUP_COUNT }, () => []))
  // A side can be covered by several quads (e.g. the back of stairs: slab +
  // step), so coverage is the union of quads on a 16×16 grid per side.
  const anyCoverage = Array.from({ length: 6 }, () => new Uint8Array(256))
  const opaqueCoverage = Array.from({ length: 6 }, () => new Uint8Array(256))

  for (const quad of quads) {
    const layer = layerOf(quad, atlas)
    const side = boundarySide(quad)
    buckets[layer][side ?? INNER_GROUP].push(quad)
    if (side !== null) {
      markCoverage(quad, side, anyCoverage[side])
      if (layer === RenderLayer.Opaque) markCoverage(quad, side, opaqueCoverage[side])
    }
  }

  return {
    geometry: buckets.map((groups) =>
      groups.map((g) => (g.length ? toGeometry(g, atlas.getPixelSize?.() ?? 0) : null)),
    ),
    opaqueFaces: coverageMask(opaqueCoverage),
    fullFaces: coverageMask(anyCoverage),
  }
}

/**
 * Mesh of one state (no culling) and whether Deepslate's special renderers
 * drew it, or null when the block has no model at all.
 */
function meshOf(
  state: BlockState,
  resources: GameResources,
  atlas: TextureAtlasProvider,
  cull: Partial<Record<(typeof FACES)[number], boolean>> = {},
  data: BlockRenderData | null = null,
): { mesh: Mesh; special: boolean } | null {
  const name = Identifier.parse(state.name)
  const dsState = new DsBlockState(name, { ...state.properties })
  const mesh = new Mesh()
  let found = false
  let usedSpecial = false
  try {
    const definition = resources.getBlockDefinition(name)
    let modelled = false
    if (definition) {
      const model = definition.getMesh(name, { ...state.properties }, atlas, resources, cull)
      modelled = !model.isEmpty()
      mesh.merge(model)
      found = true
    }
    // Deepslate draws some blocks (signs, beds…) like the old entity models,
    // from textures that newer versions moved (26.x has JSON models for them).
    // When the game's own model exists it is used alone. Fluids are not part
    // of the model (see `fluidMeshOf`): Deepslate would add the water of a
    // waterlogged block, so it gets the block without it.
    const special =
      modelled || FLUID_BLOCKS.has(state.name) || ALWAYS_WATER.has(state.name)
        ? null
        : SpecialRenderers.getBlockMesh(dry(dsState), toDeepslateNbt(data), atlas, cull)
    if (special && !special.isEmpty()) {
      mesh.merge(special)
      found = true
      usedSpecial = true
    }
  } catch {
    // A referenced model is missing (e.g. a block newer than the game files).
    return null
  }
  return found ? { mesh, special: usedSpecial } : null
}

/** Render data in the NBT shape Deepslate's special renderers read. */
function toDeepslateNbt(data: BlockRenderData | null): NbtCompound | undefined {
  if (!data) return undefined
  const patterns = data.patterns.map(
    ({ pattern, color }) =>
      new NbtCompound(
        new Map([
          ['pattern', new NbtString(`minecraft:${pattern}`)],
          ['color', new NbtString(color)],
        ]),
      ),
  )
  return new NbtCompound(new Map([['patterns', new NbtList(patterns)]]))
}

/** Side of the block the quad lies on (all vertices on that boundary plane), or null. */
function boundarySide(quad: Quad): number | null {
  const v = quad.vertices().map((vertex) => vertex.pos)
  const all = (axis: 'x' | 'y' | 'z', value: number) =>
    v.every((p) => Math.abs(p[axis] - value) < EPS)
  if (all('y', 1)) return 0
  if (all('y', 0)) return 1
  if (all('z', 0)) return 2
  if (all('z', 1)) return 3
  if (all('x', 1)) return 4
  if (all('x', 0)) return 5
  return null
}

/**
 * Marks the 1/16-block cells of a side covered by a quad. Faces on a block
 * boundary are axis-aligned, so their bounding rectangle is the face itself.
 */
function markCoverage(quad: Quad, side: number, cells: Uint8Array): void {
  const [a, b] =
    side <= 1 ? (['x', 'z'] as const) : side <= 3 ? (['x', 'y'] as const) : (['y', 'z'] as const)
  const v = quad.vertices().map((vertex) => vertex.pos)
  const cell = (value: number) => Math.min(16, Math.max(0, Math.round(value * 16)))
  const a0 = cell(Math.min(...v.map((p) => p[a])))
  const a1 = cell(Math.max(...v.map((p) => p[a])))
  const b0 = cell(Math.min(...v.map((p) => p[b])))
  const b1 = cell(Math.max(...v.map((p) => p[b])))
  for (let i = a0; i < a1; i++) for (let j = b0; j < b1; j++) cells[i * 16 + j] = 1
}

/** Bit `i` set when every cell of side `i` is covered. */
function coverageMask(coverage: Uint8Array[]): number {
  let mask = 0
  coverage.forEach((cells, side) => {
    if (cells.every((c) => c === 1)) mask |= 1 << side
  })
  return mask
}

function layerOf(quad: Quad, atlas: BakeAtlas): RenderLayer {
  const uvs = quad.vertices().map((v) => v.texture ?? [0, 0])
  const u = uvs.reduce((s, t) => s + t[0], 0) / 4
  const vv = uvs.reduce((s, t) => s + t[1], 0) / 4
  return atlas.layerAt(u, vv)
}

/**
 * Fraction of an atlas pixel by which UVs are moved towards the centre of
 * their quad. Without it, nearest-neighbour sampling at the very edge of a
 * face can read the neighbouring texture in the atlas (visible as stray
 * coloured dots on distant blocks).
 */
const UV_INSET_PIXELS = 0.05

function toGeometry(quads: Quad[], pixelSize: number): QuadGeometry {
  const n = quads.length * 4
  const positions = new Float32Array(n * 3)
  const uvs = new Float32Array(n * 2)
  const colors = new Float32Array(n * 3)
  const normals = new Float32Array(n * 3)
  const inset = pixelSize * UV_INSET_PIXELS
  let i = 0
  for (const quad of quads) {
    const normal = quad.normal()
    const vertices = quad.vertices()
    const quadUvs = vertices.map((v) => v.texture ?? [0, 0])
    const cu = quadUvs.reduce((s, t) => s + t[0], 0) / 4
    const cv = quadUvs.reduce((s, t) => s + t[1], 0) / 4
    for (const [k, vertex] of vertices.entries()) {
      const [u, v] = quadUvs[k]
      positions.set([vertex.pos.x, vertex.pos.y, vertex.pos.z], i * 3)
      uvs.set([u + Math.sign(cu - u) * inset, v + Math.sign(cv - v) * inset], i * 2)
      colors.set(vertex.color ?? [1, 1, 1], i * 3)
      normals.set([normal.x, normal.y, normal.z], i * 3)
      i++
    }
  }
  return { quadCount: quads.length, positions, uvs, colors, normals }
}

/** Unit cube with the missing texture on every side (one quad per side). */
function missingCube(atlas: TextureAtlasProvider): Quad[] {
  const model = new Mesh()
  const id = Identifier.parse(MISSING_TEXTURE)
  const faces = Object.fromEntries(FACES.map((f) => [f, { texture: '#all', cullface: f }]))
  const cube = BlockModel.fromJson({
    textures: { all: id.toString() },
    elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces }],
  })
  model.merge(cube.getMesh(atlas, {}, undefined))
  // BlockModel meshes are in 1/16 units; scale to block space.
  for (const quad of model.quads) {
    for (const vertex of quad.vertices()) {
      vertex.pos = vertex.pos.scale(1 / 16)
    }
  }
  return model.quads
}

function emptyState(): BakedState {
  return {
    geometry: RENDER_LAYERS.map(() => new Array<QuadGeometry | null>(GROUP_COUNT).fill(null)),
    opaqueFaces: 0,
    fullFaces: 0,
    missing: false,
    specialModel: false,
    empty: true,
    fluid: FLUID_NONE,
    fluidHeight: 0,
    fluidRender: null,
  }
}
