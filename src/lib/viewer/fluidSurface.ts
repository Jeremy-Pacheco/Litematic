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

/** Adds a height to a weighted average, as the game does: high heights weigh 10. */
function addWeighted(acc: [number, number], height: number): void {
  if (height >= 0.8) {
    acc[0] += height * 10
    acc[1] += 10
  } else if (height >= 0) {
    acc[0] += height
    acc[1] += 1
  }
}

/**
 * Height of one top corner (`calculateAverageHeight`). `self`, `a` and `b`:
 * heights of this block and of the two side neighbours at that corner;
 * `diagonal` is only read when needed. Heights: 1 when the same fluid is
 * above, the own height for the same fluid, 0 for open space, -1 for solid
 * blocks (left out of the average).
 */
export function cornerHeight(self: number, a: number, b: number, diagonal: () => number): number {
  if (a >= 1 || b >= 1) return 1
  const acc: [number, number] = [0, 0]
  if (a > 0 || b > 0) {
    const d = diagonal()
    if (d >= 1) return 1
    addWeighted(acc, d)
  }
  addWeighted(acc, self)
  addWeighted(acc, a)
  addWeighted(acc, b)
  return acc[1] > 0 ? acc[0] / acc[1] : self
}

/**
 * Contribution of one horizontal neighbour to the flow (`FlowingFluid.getFlow`).
 * `neighbor`: its own height if it holds the same fluid, 0 if it holds none,
 * `null` if it holds another fluid (it does not affect the flow).
 * `below`: the same for the block under it, read only when the neighbour is
 * open (no fluid and not solid): fluid falling there pulls the flow.
 */
export function flowDifference(
  own: number,
  neighbor: number | null,
  open: boolean,
  below: () => number | null,
): number {
  if (neighbor === null) return 0
  if (neighbor > 0) return own - neighbor
  if (!open) return 0
  const under = below()
  return under !== null && under > 0 ? own - (under - SOURCE_HEIGHT) : 0
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
    this.#positions[layer].set(positions, q * 12)
    const uv = this.#uvs[layer]
    for (let i = 0; i < 8; i++) {
      uv[q * 8 + i] = Math.max(0, Math.min(65535, Math.round(uvs[i] * 65535)))
    }
    const color = this.#colors[layer]
    for (let v = 0; v < 4; v++) {
      for (let c = 0; c < 3; c++) {
        color[q * 12 + v * 3 + c] = Math.max(0, Math.min(255, Math.round(rgb[c] * 255)))
      }
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
const SHADE = { up: 1, down: 0.5, z: 0.8, x: 0.6 }

/**
 * Adds the visible faces (`faces`: side bits) of a fluid block at (x, y, z).
 * `flow`: horizontal flow vector (0, 0 for still fluid).
 */
export function addFluidBlock(
  out: FluidQuads,
  render: FluidRender,
  x: number,
  y: number,
  z: number,
  [nw, ne, sw, se]: Corners,
  flow: [number, number],
  faces: number,
): void {
  const { still, flow: flowing, color, layer } = render
  const u = (t: readonly number[], f: number) => t[0] + (t[2] - t[0]) * f
  const v = (t: readonly number[], f: number) => t[1] + (t[3] - t[1]) * f
  const shaded = (s: number) => [color[0] * s, color[1] * s, color[2] * s]

  if (faces & UP) {
    const h = [nw, sw, se, ne].map((c) => y + c - SURFACE_OFFSET)
    let uvs: number[]
    if (flow[0] === 0 && flow[1] === 0) {
      uvs = [
        u(still, 0),
        v(still, 0),
        u(still, 0),
        v(still, 1),
        u(still, 1),
        v(still, 1),
        u(still, 1),
        v(still, 0),
      ]
    } else {
      // The flow texture turned along the flow, sampling its middle half.
      const angle = Math.atan2(flow[1], flow[0]) - Math.PI / 2
      const s = Math.sin(angle) * 0.25
      const c = Math.cos(angle) * 0.25
      const t = flowing
      uvs = [
        u(t, 0.5 + (-c - s)),
        v(t, 0.5 + -c + s),
        u(t, 0.5 + -c + s),
        v(t, 0.5 + c + s),
        u(t, 0.5 + c + s),
        v(t, 0.5 + (c - s)),
        u(t, 0.5 + (c - s)),
        v(t, 0.5 + (-c - s)),
      ]
    }
    out.push(
      layer,
      [x, h[0], z, x, h[1], z + 1, x + 1, h[2], z + 1, x + 1, h[3], z],
      uvs,
      shaded(SHADE.up),
    )
  }

  if (faces & DOWN) {
    out.push(
      layer,
      [x, y, z + 1, x, y, z, x + 1, y, z, x + 1, y, z + 1],
      [
        u(still, 0),
        v(still, 1),
        u(still, 0),
        v(still, 0),
        u(still, 1),
        v(still, 0),
        u(still, 1),
        v(still, 1),
      ],
      shaded(SHADE.down),
    )
  }

  // Sides: from corner 1 to corner 2 along the side, up to their heights;
  // the flow texture's left half, cut at the same heights.
  const side = (
    x1: number,
    z1: number,
    h1: number,
    x2: number,
    z2: number,
    h2: number,
    s: number,
  ) => {
    out.push(
      layer,
      [x + x1, y + h1, z + z1, x + x2, y + h2, z + z2, x + x2, y, z + z2, x + x1, y, z + z1],
      [
        u(flowing, 0),
        v(flowing, (1 - h1) * 0.5),
        u(flowing, 0.5),
        v(flowing, (1 - h2) * 0.5),
        u(flowing, 0.5),
        v(flowing, 0.5),
        u(flowing, 0),
        v(flowing, 0.5),
      ],
      shaded(s),
    )
  }
  if (faces & NORTH) side(0, 0, nw, 1, 0, ne, SHADE.z)
  if (faces & SOUTH) side(1, 1, se, 0, 1, sw, SHADE.z)
  if (faces & EAST) side(1, 0, ne, 1, 1, se, SHADE.x)
  if (faces & WEST) side(0, 1, sw, 0, 0, nw, SHADE.x)
}
