import {
  FLUID_NONE,
  GROUP_COUNT,
  INNER_GROUP,
  type BakedState,
  type QuadGeometry,
} from '../models/bakedTypes'
import { RENDER_LAYERS } from '../models/renderLayer'
import {
  addFluidBlock,
  cornerHeight,
  flowDifference,
  FluidQuads,
  UP,
  type Corners,
} from './fluidSurface'
import type { Vec3 } from '../types/structure'

/**
 * Builds the geometry of a structure section by section (32 × 16 × 32 blocks):
 * copies the baked quads of every block and drops the faces hidden by a
 * neighbor. One mesh per render layer per section keeps draw calls low and
 * lets the renderer skip off-screen sections.
 */

/**
 * Section size: 16 layers high, so the layer system can hide whole sections
 * by rows of 16; 32 blocks wide and long, so a large structure needs a quarter
 * of the meshes (and draw calls) of 16³ sections.
 */
export const SECTION_HEIGHT = 16
export const SECTION_WIDTH = 32

/** Neighbor offset of each side, in `FACES` order (up, down, north, south, east, west). */
const OFFSETS: readonly (readonly [number, number, number])[] = [
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, -1],
  [0, 0, 1],
  [1, 0, 0],
  [-1, 0, 0],
]
/** Index of the opposite side. */
const OPPOSITE = [1, 0, 3, 2, 5, 4]
/** Horizontal neighbours (dx, dz). */
const HORIZONTAL: readonly (readonly [number, number])[] = [
  [0, -1],
  [0, 1],
  [1, 0],
  [-1, 0],
]

/** Minecraft's fixed directional shading, by face orientation. */
export function faceShade(nx: number, ny: number, nz: number): number {
  if (ny > 0.5) return 1
  if (ny < -0.5) return 0.5
  if (Math.abs(nz) > 0.5) return 0.8
  if (Math.abs(nx) > 0.5) return 0.6
  return 1
}

/**
 * Vertex arrays of one render layer of a section, compact to reduce memory
 * and GPU upload time (less than half of plain 32-bit floats):
 * - `uvs`: 16-bit normalized (0–65535 → 0–1); the atlas gutter absorbs the
 *   rounding (≤ 0.07 px for a 4096 px atlas).
 * - `colors`: 8-bit normalized RGB (tint × face shade).
 * - `indices`: 16-bit when the layer has at most 65 536 vertices.
 */
export interface LayerMesh {
  quadCount: number
  positions: Float32Array
  uvs: Uint16Array
  colors: Uint8Array
  indices: Uint16Array | Uint32Array
}

export interface SectionMesh {
  /** Section coordinates (× SECTION_WIDTH in X and Z, × SECTION_HEIGHT in Y). */
  section: Vec3
  /** One entry per render layer (opaque, cutout, translucent). */
  layers: (LayerMesh | null)[]
}

export interface MesherInput {
  /** Size of the whole structure. */
  size: Vec3
  /**
   * Blocks of the whole structure, or of a slab of whole layers starting at
   * `yStart` (a worker meshing part of the structure only needs its layers
   * plus one above and one below).
   */
  blocks: Uint16Array | Uint32Array
  /** First layer held by `blocks` (0 for the whole structure). */
  yStart?: number
  states: readonly MesherState[]
}

/** Side of a level that a cap covers: the top (`up`) or the bottom (`down`). */
export type CapSide = 'up' | 'down'

/** Half-open box of block positions. */
interface Box {
  x0: number
  y0: number
  z0: number
  x1: number
  y1: number
  z1: number
}

/** The parts of a baked state the mesher needs. */
export type MesherState = Pick<
  BakedState,
  'geometry' | 'opaqueFaces' | 'fullFaces' | 'empty' | 'fluid' | 'fluidHeight' | 'fluidRender'
>

/**
 * Per-state geometry with the directional shade already applied to the tint
 * colors (computed once per state, not per block).
 */
interface PreparedGroup {
  geometry: QuadGeometry
  /** 8-bit normalized RGB. */
  shadedColors: Uint8Array
  /** 16-bit normalized UV. */
  uvs: Uint16Array
}

/** `[layer][group]`, like `QuadGeometry` groups. */
type PreparedLayers = (PreparedGroup | null)[][]

export class Mesher {
  readonly #size: Vec3
  readonly #blocks: Uint16Array | Uint32Array
  /** Layers held by `#blocks`: [`#yStart`, `#yEnd`). */
  readonly #yStart: number
  readonly #yEnd: number
  readonly #states: readonly MesherState[]
  /** Per state: the model (the fluid it holds is built per block, see `#addFluid`). */
  readonly #prepared: PreparedLayers[]
  /** Whether the model has any quad (water and lava have none). */
  readonly #hasModel: boolean[]

  constructor(input: MesherInput) {
    this.#size = input.size
    this.#blocks = input.blocks
    this.#yStart = input.yStart ?? 0
    this.#yEnd = this.#yStart + input.blocks.length / (input.size.x * input.size.z)
    this.#states = input.states
    this.#prepared = input.states.map((state) =>
      state.geometry.map((groups) => groups.map((g) => (g ? prepare(g) : null))),
    )
    this.#hasModel = input.states.map((state) => state.geometry.some((l) => l.some(Boolean)))
  }

  /** Number of sections along each axis. */
  get sectionCounts(): Vec3 {
    const { x, y, z } = this.#size
    return {
      x: Math.ceil(x / SECTION_WIDTH),
      y: Math.ceil(y / SECTION_HEIGHT),
      z: Math.ceil(z / SECTION_WIDTH),
    }
  }

  meshSection(sx: number, sy: number, sz: number): SectionMesh {
    const { x: X, y: Y, z: Z } = this.#size
    const x0 = sx * SECTION_WIDTH
    const y0 = sy * SECTION_HEIGHT
    const z0 = sz * SECTION_WIDTH
    const box = {
      x0,
      y0,
      z0,
      x1: Math.min(X, x0 + SECTION_WIDTH),
      y1: Math.min(Y, y0 + SECTION_HEIGHT),
      z1: Math.min(Z, z0 + SECTION_WIDTH),
    }
    return { section: { x: sx, y: sy, z: sz }, layers: this.#meshBox(box, null) }
  }

  /**
   * Every face on side `side` (top or bottom) of the blocks of level `y`,
   * **without** hiding the ones covered by the level above or below. The
   * layer system shows it when that neighbouring level is hidden, so a cut
   * through the structure shows closed blocks instead of holes.
   */
  meshCap(y: number, side: CapSide): (LayerMesh | null)[] {
    const { x: X, z: Z } = this.#size
    const box = { x0: 0, y0: y, z0: 0, x1: X, y1: y + 1, z1: Z }
    return this.#meshBox(box, side === 'up' ? 0 : 1)
  }

  /**
   * Meshes the blocks of a box. With `onlyGroup` null, every group with the
   * hidden faces removed; otherwise only that side group, with no culling.
   */
  #meshBox(box: Box, onlyGroup: number | null): (LayerMesh | null)[] {
    const { x: X, z: Z } = this.#size
    const { x0, y0, z0, x1, y1, z1 } = box
    const firstGroup = onlyGroup ?? 0
    const lastGroup = onlyGroup ?? GROUP_COUNT - 1

    // Pass 1: decide which groups are visible and count their quads; fluid
    // quads are built straight into `fluids`.
    const visible: { layer: number; group: PreparedGroup; x: number; y: number; z: number }[] = []
    const quadCounts = [0, 0, 0]
    const fluids = new FluidQuads(RENDER_LAYERS.length)

    for (let y = y0; y < y1; y++) {
      for (let z = z0; z < z1; z++) {
        for (let x = x0; x < x1; x++) {
          const stateIndex = this.#blocks[((y - this.#yStart) * Z + z) * X + x]
          const state = this.#states[stateIndex]
          if (!state || state.empty) continue
          if (state.fluidRender) this.#addFluid(fluids, x, y, z, stateIndex, onlyGroup)
          if (!this.#hasModel[stateIndex]) continue
          const prepared = this.#prepared[stateIndex]
          for (const layer of RENDER_LAYERS) {
            const groups = prepared[layer]
            for (let group = firstGroup; group <= lastGroup; group++) {
              const g = groups[group]
              if (!g) continue
              const cull = onlyGroup === null && group !== INNER_GROUP
              if (cull && this.#hidden(x, y, z, group, stateIndex, layer, false)) continue
              visible.push({ layer, group: g, x, y, z })
              quadCounts[layer] += g.geometry.quadCount
            }
          }
        }
      }
    }

    // Pass 2: copy into exactly sized arrays, the fluids after the models.
    const layers: (LayerMesh | null)[] = quadCounts.map((n, layer) =>
      n + fluids.counts[layer] ? allocate(n + fluids.counts[layer]) : null,
    )
    const written = [0, 0, 0]
    for (const { layer, group, x, y, z } of visible) {
      const out = layers[layer]!
      const quadOffset = written[layer]
      const vertexOffset = quadOffset * 4
      const { geometry, shadedColors } = group
      const vertexCount = geometry.quadCount * 4

      const p = geometry.positions
      for (let v = 0; v < vertexCount; v++) {
        const o = (vertexOffset + v) * 3
        out.positions[o] = p[v * 3] + x
        out.positions[o + 1] = p[v * 3 + 1] + y
        out.positions[o + 2] = p[v * 3 + 2] + z
      }
      out.uvs.set(group.uvs, vertexOffset * 2)
      out.colors.set(shadedColors, vertexOffset * 3)
      for (let q = 0; q < geometry.quadCount; q++) {
        const base = vertexOffset + q * 4
        const i = (quadOffset + q) * 6
        out.indices[i] = base
        out.indices[i + 1] = base + 1
        out.indices[i + 2] = base + 2
        out.indices[i + 3] = base
        out.indices[i + 4] = base + 2
        out.indices[i + 5] = base + 3
      }
      written[layer] += geometry.quadCount
    }
    for (const layer of RENDER_LAYERS) {
      const count = fluids.counts[layer]
      if (count === 0) continue
      const out = layers[layer]!
      const quadOffset = written[layer]
      const { positions, uvs, colors } = fluids.layer(layer)
      out.positions.set(positions, quadOffset * 12)
      out.uvs.set(uvs, quadOffset * 8)
      out.colors.set(colors, quadOffset * 12)
      for (let q = 0; q < count; q++) {
        const base = (quadOffset + q) * 4
        out.indices.set([base, base + 1, base + 2, base, base + 2, base + 3], (quadOffset + q) * 6)
      }
      written[layer] += count
    }

    return layers
  }

  /**
   * Builds the fluid of one block (see `fluidSurface`): corner heights from
   * the neighbours, the flow, and the faces not hidden by the same fluid or
   * an opaque side. With `onlyGroup` (a layer cap), only that side, always.
   */
  #addFluid(
    out: FluidQuads,
    x: number,
    y: number,
    z: number,
    stateIndex: number,
    onlyGroup: number | null,
  ): void {
    const state = this.#states[stateIndex]
    const fluid = state.fluid
    let faces = 0
    if (onlyGroup !== null) {
      faces = 1 << onlyGroup
    } else {
      for (let group = 0; group < 6; group++) {
        if (!this.#hidden(x, y, z, group, stateIndex, 0, true)) faces |= 1 << group
      }
      // The surface only shows without the same fluid above.
      if (this.#fluidAt(x, y + 1, z) === fluid) faces &= ~UP
    }
    if (faces === 0) return

    const height = (dx: number, dz: number) => this.#fluidHeight(x + dx, y, z + dz, fluid)
    const self = height(0, 0)
    let corners: Corners = [1, 1, 1, 1]
    if (self < 1) {
      const n = height(0, -1)
      const s = height(0, 1)
      const e = height(1, 0)
      const w = height(-1, 0)
      corners = [
        cornerHeight(self, n, w, () => height(-1, -1)),
        cornerHeight(self, n, e, () => height(1, -1)),
        cornerHeight(self, s, w, () => height(-1, 1)),
        cornerHeight(self, s, e, () => height(1, 1)),
      ]
    }

    // Flow: only the surface shows it, so it is only needed when that is drawn.
    let fx = 0
    let fz = 0
    if (faces & UP && self < 1) {
      const own = state.fluidHeight
      for (const [dx, dz] of HORIZONTAL) {
        const neighbor = this.#ownFluid(x + dx, y, z + dz, fluid)
        const diff = flowDifference(own, neighbor, this.#isOpen(x + dx, y, z + dz), () =>
          this.#ownFluid(x + dx, y - 1, z + dz, fluid),
        )
        fx += dx * diff
        fz += dz * diff
      }
    }
    addFluidBlock(out, state.fluidRender!, x, y, z, corners, [fx, fz], faces)
  }

  /**
   * Height of a position for the corners of `fluid` (the game's
   * `getHeight`): 1 with the same fluid above, its own height for the same
   * fluid, 0 for open space, -1 for solid blocks and outside the structure
   * (left out of the average, so the edge of a cut does not slope down).
   */
  #fluidHeight(x: number, y: number, z: number, fluid: number): number {
    const index = this.#indexAt(x, y, z)
    if (index < 0) return -1
    const state = this.#states[this.#blocks[index]]
    if (state?.fluid === fluid) return this.#fluidAt(x, y + 1, z) === fluid ? 1 : state.fluidHeight
    return this.#isOpen(x, y, z) ? 0 : -1
  }

  /**
   * Own height of `fluid` at a position for the flow: the height for the same
   * fluid, 0 for none, `null` for another fluid or outside the structure.
   */
  #ownFluid(x: number, y: number, z: number, fluid: number): number | null {
    const index = this.#indexAt(x, y, z)
    if (index < 0) return null
    const state = this.#states[this.#blocks[index]]
    if (!state || state.fluid === FLUID_NONE) return 0
    return state.fluid === fluid ? state.fluidHeight : null
  }

  /**
   * Open space for a fluid: air or a block that covers no side (plants,
   * torches…). Approximates the game's "solid" with the model's coverage.
   */
  #isOpen(x: number, y: number, z: number): boolean {
    const index = this.#indexAt(x, y, z)
    if (index < 0) return false
    const state = this.#states[this.#blocks[index]]
    return !state || state.empty || (state.opaqueFaces === 0 && state.fullFaces === 0)
  }

  /** Fluid filling a position (`FLUID_NONE` outside the structure). */
  #fluidAt(x: number, y: number, z: number): number {
    const index = this.#indexAt(x, y, z)
    return index < 0 ? FLUID_NONE : (this.#states[this.#blocks[index]]?.fluid ?? FLUID_NONE)
  }

  /** Index in `#blocks` of a position, or -1 outside the structure or the slab. */
  #indexAt(x: number, y: number, z: number): number {
    const { x: X, z: Z } = this.#size
    if (x < 0 || z < 0 || x >= X || z >= Z || y < this.#yStart || y >= this.#yEnd) return -1
    return ((y - this.#yStart) * Z + z) * X + x
  }

  /**
   * A face on side `group` is hidden when the neighbor covers the opposite
   * side with opaque faces. A fluid face is also hidden next to the same
   * fluid (water beside water or a waterlogged block); a model face, when
   * both are the same see-through block covering the shared side (glass next
   * to glass).
   */
  #hidden(
    x: number,
    y: number,
    z: number,
    group: number,
    stateIndex: number,
    layer: number,
    isFluid: boolean,
  ): boolean {
    const [dx, dy, dz] = OFFSETS[group]
    const nx = x + dx
    const ny = y + dy
    const nz = z + dz
    const position = this.#indexAt(nx, ny, nz)
    if (position < 0) return false
    const neighborIndex = this.#blocks[position]
    const neighbor = this.#states[neighborIndex]
    if (!neighbor || neighbor.empty) return false
    const opposite = 1 << OPPOSITE[group]
    if (neighbor.opaqueFaces & opposite) return true
    const state = this.#states[stateIndex]
    if (isFluid) return neighbor.fluid === state.fluid
    if (layer !== 0 && neighborIndex === stateIndex) {
      return (state.fullFaces & (1 << group)) !== 0 && (neighbor.fullFaces & opposite) !== 0
    }
    return false
  }
}

function prepare(geometry: QuadGeometry): PreparedGroup {
  const vertexCount = geometry.quadCount * 4
  const shadedColors = new Uint8Array(vertexCount * 3)
  const uvs = new Uint16Array(vertexCount * 2)
  const toByte = (value: number) => Math.max(0, Math.min(255, Math.round(value * 255)))
  for (let v = 0; v < vertexCount; v++) {
    const shade = faceShade(
      geometry.normals[v * 3],
      geometry.normals[v * 3 + 1],
      geometry.normals[v * 3 + 2],
    )
    for (let c = 0; c < 3; c++) shadedColors[v * 3 + c] = toByte(geometry.colors[v * 3 + c] * shade)
    for (let c = 0; c < 2; c++) {
      uvs[v * 2 + c] = Math.max(0, Math.min(65535, Math.round(geometry.uvs[v * 2 + c] * 65535)))
    }
  }
  return { geometry, shadedColors, uvs }
}

function allocate(quadCount: number): LayerMesh {
  const vertexCount = quadCount * 4
  return {
    quadCount,
    positions: new Float32Array(vertexCount * 3),
    uvs: new Uint16Array(vertexCount * 2),
    colors: new Uint8Array(vertexCount * 3),
    indices: vertexCount <= 65536 ? new Uint16Array(quadCount * 6) : new Uint32Array(quadCount * 6),
  }
}
