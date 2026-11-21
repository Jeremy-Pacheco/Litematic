import type { Vec3 } from '../types/structure'
import type { LayerRange } from './layers'

/**
 * Finds the block under the cursor by walking the ray through the block grid
 * (Amanatides & Woo voxel traversal) instead of testing triangles: it visits
 * at most `x + y + z` cells, so it costs the same for a house or a city, and
 * it only needs the block array.
 */

export interface Ray {
  origin: Vec3
  /** Need not be normalized; must not be zero. */
  direction: Vec3
}

export interface PickOptions {
  size: Vec3
  /** Whether the position holds something (not air). */
  isSolid: (x: number, y: number, z: number) => boolean
  /** Only these layers can be picked (the visible ones); `null`: all. */
  range?: LayerRange | null
}

/** First solid block hit by the ray inside the structure, or `null`. */
export function pickBlock(ray: Ray, { size, isSolid, range = null }: PickOptions): Vec3 | null {
  const minY = range ? range.min : 0
  const maxY = range ? range.max + 1 : size.y
  const lo = [0, minY, 0]
  const hi = [size.x, maxY, size.z]
  const o = [ray.origin.x, ray.origin.y, ray.origin.z]
  const d = [ray.direction.x, ray.direction.y, ray.direction.z]

  // Entry and exit distances of the ray through the (layer-limited) box.
  let tEnter = 0
  let tExit = Infinity
  for (let axis = 0; axis < 3; axis++) {
    if (d[axis] === 0) {
      if (o[axis] < lo[axis] || o[axis] > hi[axis]) return null
      continue
    }
    let t0 = (lo[axis] - o[axis]) / d[axis]
    let t1 = (hi[axis] - o[axis]) / d[axis]
    if (t0 > t1) [t0, t1] = [t1, t0]
    tEnter = Math.max(tEnter, t0)
    tExit = Math.min(tExit, t1)
  }
  if (tEnter > tExit) return null

  // Start cell: a hair past the entry point, clamped into the box.
  const start = o.map((v, axis) => v + d[axis] * (tEnter + 1e-6))
  const cell = start.map((v, axis) => Math.min(hi[axis] - 1, Math.max(lo[axis], Math.floor(v))))
  const step = d.map((v) => (v > 0 ? 1 : v < 0 ? -1 : 0))
  const tDelta = d.map((v) => (v === 0 ? Infinity : Math.abs(1 / v)))
  const tMax = d.map((v, axis) => {
    if (v === 0) return Infinity
    const boundary = v > 0 ? cell[axis] + 1 : cell[axis]
    return (boundary - o[axis]) / v
  })

  for (;;) {
    if (isSolid(cell[0], cell[1], cell[2])) return { x: cell[0], y: cell[1], z: cell[2] }
    // Advance along the axis whose next boundary is closest.
    const axis = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : tMax[1] < tMax[2] ? 1 : 2
    if (tMax[axis] > tExit) return null
    cell[axis] += step[axis]
    if (cell[axis] < lo[axis] || cell[axis] >= hi[axis]) return null
    tMax[axis] += tDelta[axis]
  }
}
