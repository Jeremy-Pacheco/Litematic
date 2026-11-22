import type { FluidRender } from '../models/bakedTypes'

/**
 * Shape of a fluid block as the game draws it (`LiquidBlockRenderer`): the
 * height of each top corner is a weighted average of the four blocks around
 * it, the surface slopes between them, and flowing fluid shows the flow
 * texture turned along the flow. Pure functions plus a quad sink; the mesher
 * samples the neighbours and decides which faces are visible.
 */

/** Side bits, in `FACES` order (up, down, north, south, east, west). */
export const UP = 1 << 0
export const DOWN = 1 << 1
export const NORTH = 1 << 2
export const SOUTH = 1 << 3
export const EAST = 1 << 4
export const WEST = 1 << 5

/** A source's own height (amount 8 of 9). */
export const SOURCE_HEIGHT = 8 / 9
/** The surface sits this far below its height, as in the game (no z-fighting at 1). */
const SURFACE_OFFSET = 0.001

/** Weight of a height in a corner average, as the game: high heights weigh 10. */
function weight(height: number): number {
  return height >= 0.8 ? 10 : height >= 0 ? 1 : 0
}

/**
 * Whether a corner needs the diagonal block's height: only when a side
 * neighbour holds some of the fluid and none reaches the top.
 */
export function needsDiagonal(a: number, b: number): boolean {
  return a < 1 && b < 1 && (a > 0 || b > 0)
}

/**
 * Height of one top corner (`calculateAverageHeight`). `self`, `a` and `b`:
 * heights of this block and of the two side neighbours at that corner;
 * `diagonal`: the diagonal block's height when `needsDiagonal`, otherwise
 * ignored. Heights: 1 when the same fluid is above, the own height for the
 * same fluid, 0 for open space, -1 for solid blocks (left out).
 */
export function cornerHeight(self: number, a: number, b: number, diagonal: number): number {
  if (a >= 1 || b >= 1) return 1
  let sum = 0
  let total = 0
  if (a > 0 || b > 0) {
    if (diagonal >= 1) return 1
    sum += diagonal * weight(diagonal)
    total += weight(diagonal)
  }
  sum += self * weight(self) + a * weight(a) + b * weight(b)
  total += weight(self) + weight(a) + weight(b)
  return total > 0 ? sum / total : self
}

/**
 * Contribution of one horizontal neighbour to the flow (`FlowingFluid.getFlow`).
 * `neighbor`: its own height if it holds the same fluid, 0 if it holds none,
 * `null` if it holds another fluid (it does not affect the flow).
 * `below`: the same for the block under it, which matters only when the
 * neighbour is open (no fluid, not solid): fluid falling there pulls the flow.
 */
export function flowDifference(
  own: number,
  neighbor: number | null,
  open: boolean,
  below: number | null,
): number {
  if (neighbor === null) return 0
  if (neighbor > 0) return own - neighbor
  if (!open) return 0
  return below !== null && below > 0 ? own - (below - SOURCE_HEIGHT) : 0
}

/** Corner heights: north-west, north-east, south-west, south-east. */
export type Corners = [number, number, number, number]

/** Growable per-layer arrays of fluid quads, in the mesher's compact format. */
export class FluidQuads {
  #positions: Float32Array[] = []
  #uvs: Uint16Array[] = []
  #colors: Uint8Array[] = []
  readonly counts: number[]

  constructor(layers: number) {
    this.counts = new Array<number>(layers).fill(0)
    for (let l = 0; l < layers; l++) {
      this.#positions.push(new Float32Array(0))
      this.#uvs.push(new Uint16Array(0))
      this.#colors.push(new Uint8Array(0))
    }
  }

  /** Room for one more quad in a layer. */
  #reserve(layer: number): number {
    const q = this.counts[layer]
    if ((q + 1) * 12 > this.#positions[layer].length) {
      const capacity = Math.max(64, q * 2)
      const grow = <T extends Float32Array | Uint16Array | Uint8Array>(old: T, size: number) => {
        const next = new (old.constructor as new (n: number) => T)(capacity * size)
        next.set(old)
        return next
      }
      this.#positions[layer] = grow(this.#positions[layer], 12)
      this.#uvs[layer] = grow(this.#uvs[layer], 8)
      this.#colors[layer] = grow(this.#colors[layer], 12)
    }
    this.counts[layer] = q + 1
    return q
  }

  /** One quad: 4 positions (xyz), 4 UVs (0–1 atlas), one shaded RGB color (0–1). */
  push(layer: number, positions: number[], uvs: number[], rgb: readonly number[]): void {
    const q = this.#reserve(layer)
    const pos = this.#positions[layer]
    for (let i = 0; i < 12; i++) pos[q * 12 + i] = positions[i]
    // Uint16Array and Uint8ClampedArray-like rounding by hand: the values are in range.
    const uv = this.#uvs[layer]
    for (let i = 0; i < 8; i++) uv[q * 8 + i] = (uvs[i] * 65535 + 0.5) | 0
    const color = this.#colors[layer]
    const r = Math.min(255, (rgb[0] * 255 + 0.5) | 0)
    const g = Math.min(255, (rgb[1] * 255 + 0.5) | 0)
    const b = Math.min(255, (rgb[2] * 255 + 0.5) | 0)
    for (let v = 0; v < 4; v++) {
      const o = q * 12 + v * 3
      color[o] = r
      color[o + 1] = g
      color[o + 2] = b
    }
  }

  /** The quads of a layer, for copying into the section mesh. */
  layer(layer: number): { positions: Float32Array; uvs: Uint16Array; colors: Uint8Array } {
    const n = this.counts[layer]
    return {
      positions: this.#positions[layer].subarray(0, n * 12),
      uvs: this.#uvs[layer].subarray(0, n * 8),
      colors: this.#colors[layer].subarray(0, n * 12),
    }
  }
}

/** The game's fixed face shading: up, down, north/south, east/west. */
const SHADE_UP = 1
const SHADE_DOWN = 0.5
const SHADE_Z = 0.8
const SHADE_X = 0.6

// Scratch arrays for one quad, reused for every face (no allocation per block).
const POS: number[] = new Array<number>(12).fill(0)
const UV: number[] = new Array<number>(8).fill(0)
const RGB: number[] = [0, 0, 0]

/** Writes the 4 corners of a quad into `POS`. */
function corners4(
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
  x3: number,
  y3: number,
  z3: number,
): void {
  POS[0] = x0
  POS[1] = y0
  POS[2] = z0
  POS[3] = x1
  POS[4] = y1
  POS[5] = z1
  POS[6] = x2
  POS[7] = y2
  POS[8] = z2
  POS[9] = x3
  POS[10] = y3
  POS[11] = z3
}

/** Writes UV `k` as fractions (fu, fv) of an atlas rectangle. */
function uvAt(k: number, rect: readonly number[], fu: number, fv: number): void {
  UV[k * 2] = rect[0] + (rect[2] - rect[0]) * fu
  UV[k * 2 + 1] = rect[1] + (rect[3] - rect[1]) * fv
}

function shade(color: readonly number[], s: number): number[] {
  RGB[0] = color[0] * s
  RGB[1] = color[1] * s
  RGB[2] = color[2] * s
  return RGB
}

/**
 * Adds the visible faces (`faces`: side bits) of a fluid block at (x, y, z).
 * `flowX`, `flowZ`: horizontal flow vector (0, 0 for still fluid).
 */
export function addFluidBlock(
  out: FluidQuads,
  render: FluidRender,
  x: number,
  y: number,
  z: number,
  corners: Corners,
  flowX: number,
  flowZ: number,
  faces: number,
): void {
  const { still, flow, color, layer } = render
  const [nw, ne, sw, se] = corners

  if (faces & UP) {
    const top = y - SURFACE_OFFSET
    corners4(x, top + nw, z, x, top + sw, z + 1, x + 1, top + se, z + 1, x + 1, top + ne, z)
    if (flowX === 0 && flowZ === 0) {
      uvAt(0, still, 0, 0)
      uvAt(1, still, 0, 1)
      uvAt(2, still, 1, 1)
      uvAt(3, still, 1, 0)
    } else {
      // The flow texture turned along the flow, sampling its middle half.
      const angle = Math.atan2(flowZ, flowX) - Math.PI / 2
      const s = Math.sin(angle) * 0.25
      const c = Math.cos(angle) * 0.25
      uvAt(0, flow, 0.5 - c - s, 0.5 - c + s)
      uvAt(1, flow, 0.5 - c + s, 0.5 + c + s)
      uvAt(2, flow, 0.5 + c + s, 0.5 + c - s)
      uvAt(3, flow, 0.5 + c - s, 0.5 - c - s)
    }
    out.push(layer, POS, UV, shade(color, SHADE_UP))
  }

  if (faces & DOWN) {
    corners4(x, y, z + 1, x, y, z, x + 1, y, z, x + 1, y, z + 1)
    uvAt(0, still, 0, 1)
    uvAt(1, still, 0, 0)
    uvAt(2, still, 1, 0)
    uvAt(3, still, 1, 1)
    out.push(layer, POS, UV, shade(color, SHADE_DOWN))
  }

  if (faces & NORTH) side(out, render, x, y, z, 0, 0, nw, 1, 0, ne, SHADE_Z)
  if (faces & SOUTH) side(out, render, x, y, z, 1, 1, se, 0, 1, sw, SHADE_Z)
  if (faces & EAST) side(out, render, x, y, z, 1, 0, ne, 1, 1, se, SHADE_X)
  if (faces & WEST) side(out, render, x, y, z, 0, 1, sw, 0, 0, nw, SHADE_X)
}

/**
 * One side, from corner 1 to corner 2 along it, up to their heights; the
 * flow texture's left half, cut at the same heights.
 */
function side(
  out: FluidQuads,
  { flow, color, layer }: FluidRender,
  x: number,
  y: number,
  z: number,
  x1: number,
  z1: number,
  h1: number,
  x2: number,
  z2: number,
  h2: number,
  s: number,
): void {
  corners4(x + x1, y + h1, z + z1, x + x2, y + h2, z + z2, x + x2, y, z + z2, x + x1, y, z + z1)
  uvAt(0, flow, 0, (1 - h1) * 0.5)
  uvAt(1, flow, 0.5, (1 - h2) * 0.5)
  uvAt(2, flow, 0.5, 0.5)
  uvAt(3, flow, 0, 0.5)
  out.push(layer, POS, UV, shade(color, s))
}
