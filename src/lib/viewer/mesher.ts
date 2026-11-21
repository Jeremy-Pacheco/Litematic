import { GROUP_COUNT, INNER_GROUP, type BakedState, type QuadGeometry } from '../models/bakedTypes'
import { RENDER_LAYERS } from '../models/renderLayer'
import type { Vec3 } from '../types/structure'

/**
 * Builds the geometry of a structure section by section (16×16×16 blocks):
 * copies the baked quads of every block and drops the faces hidden by a
 * neighbor. One mesh per render layer per section keeps draw calls low and
 * lets the renderer skip off-screen sections.
 */

export const SECTION_SIZE = 16

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
  /** Section coordinates (multiply by SECTION_SIZE for the block origin). */
  section: Vec3
  /** One entry per render layer (opaque, cutout, translucent). */
  layers: (LayerMesh | null)[]
}

export interface MesherInput {
  size: Vec3
  blocks: Uint16Array | Uint32Array
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
export type MesherState = Pick<BakedState, 'geometry' | 'opaqueFaces' | 'fullFaces' | 'empty'>

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

export class Mesher {
  readonly #size: Vec3
  readonly #blocks: Uint16Array | Uint32Array
  readonly #states: readonly MesherState[]
  readonly #prepared: (PreparedGroup | null)[][][]

  constructor(input: MesherInput) {
    this.#size = input.size
    this.#blocks = input.blocks
    this.#states = input.states
    this.#prepared = input.states.map((state) =>
      state.geometry.map((groups) => groups.map((g) => (g ? prepare(g) : null))),
    )
  }

  /** Number of sections along each axis. */
  get sectionCounts(): Vec3 {
    const { x, y, z } = this.#size
    return {
      x: Math.ceil(x / SECTION_SIZE),
      y: Math.ceil(y / SECTION_SIZE),
      z: Math.ceil(z / SECTION_SIZE),
    }
  }

  meshSection(sx: number, sy: number, sz: number): SectionMesh {
    const { x: X, y: Y, z: Z } = this.#size
    const x0 = sx * SECTION_SIZE
    const y0 = sy * SECTION_SIZE
    const z0 = sz * SECTION_SIZE
    const box = {
      x0,
      y0,
      z0,
      x1: Math.min(X, x0 + SECTION_SIZE),
      y1: Math.min(Y, y0 + SECTION_SIZE),
      z1: Math.min(Z, z0 + SECTION_SIZE),
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

    // Pass 1: decide which groups are visible and count their quads.
    const visible: { layer: number; group: PreparedGroup; x: number; y: number; z: number }[] = []
    const quadCounts = [0, 0, 0]

    for (let y = y0; y < y1; y++) {
      for (let z = z0; z < z1; z++) {
        for (let x = x0; x < x1; x++) {
          const stateIndex = this.#blocks[(y * Z + z) * X + x]
          const state = this.#states[stateIndex]
          if (!state || state.empty) continue
          const prepared = this.#prepared[stateIndex]
          for (const layer of RENDER_LAYERS) {
            const groups = prepared[layer]
            for (let group = firstGroup; group <= lastGroup; group++) {
              const g = groups[group]
              if (!g) continue
              const cull = onlyGroup === null && group !== INNER_GROUP
              if (cull && this.#hidden(x, y, z, group, stateIndex, layer)) continue
              visible.push({ layer, group: g, x, y, z })
              quadCounts[layer] += g.geometry.quadCount
            }
          }
        }
      }
    }

    // Pass 2: copy into exactly sized arrays.
    const layers: (LayerMesh | null)[] = quadCounts.map((n) => (n ? allocate(n) : null))
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

    return layers
  }

  /**
   * A face on side `group` is hidden when the neighbor covers the opposite
   * side with opaque faces, or when both are the same see-through block
   * covering the shared side (glass next to glass).
   */
  #hidden(
    x: number,
    y: number,
    z: number,
    group: number,
    stateIndex: number,
    layer: number,
  ): boolean {
    const [dx, dy, dz] = OFFSETS[group]
    const nx = x + dx
    const ny = y + dy
    const nz = z + dz
    const { x: X, y: Y, z: Z } = this.#size
    if (nx < 0 || ny < 0 || nz < 0 || nx >= X || ny >= Y || nz >= Z) return false
    const neighborIndex = this.#blocks[(ny * Z + nz) * X + nx]
    const neighbor = this.#states[neighborIndex]
    if (!neighbor || neighbor.empty) return false
    const opposite = 1 << OPPOSITE[group]
    if (neighbor.opaqueFaces & opposite) return true
    if (layer !== 0 && neighborIndex === stateIndex) {
      const state = this.#states[stateIndex]
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
