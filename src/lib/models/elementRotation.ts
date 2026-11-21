/**
 * Since 26.x a model element can be turned with one angle per axis
 * (`"rotation": {"x": 180, "y": -67.5, "z": -180, "origin": […]}`) instead of
 * the classic single `axis` and `angle`. Deepslate only reads the classic
 * form, so these rotations are rewritten into it when they amount to a turn
 * around a single axis (as in the only vanilla model using them, the hanging
 * sign at rotation 3). Others are left as they are: the model stays
 * unreadable, as before.
 */

type Matrix = number[][]

const AXES = ['x', 'y', 'z'] as const
type Axis = (typeof AXES)[number]
const EPS = 1e-6

/** Rotation by `degrees` around one axis (right-handed, like Deepslate's). */
function axisMatrix(axis: Axis, degrees: number): Matrix {
  const r = (degrees * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  if (axis === 'x')
    return [
      [1, 0, 0],
      [0, c, -s],
      [0, s, c],
    ]
  if (axis === 'y')
    return [
      [c, 0, s],
      [0, 1, 0],
      [-s, 0, c],
    ]
  return [
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1],
  ]
}

function multiply(a: Matrix, b: Matrix): Matrix {
  return a.map((row) => [0, 1, 2].map((j) => row.reduce((sum, v, k) => sum + v * b[k][j], 0)))
}

/**
 * The single-axis turn equal to rotating by `x`, then `y`, then `z` degrees,
 * or null when no single axis gives the same result.
 */
export function singleAxisRotation(
  x: number,
  y: number,
  z: number,
): { axis: Axis; angle: number } | null {
  const m = multiply(axisMatrix('z', z), multiply(axisMatrix('y', y), axisMatrix('x', x)))
  // A turn around axis i leaves that axis unchanged: m[i][i] = 1.
  for (const [i, axis] of AXES.entries()) {
    if (Math.abs(m[i][i] - 1) > EPS) continue
    const [a, b] = [0, 1, 2].filter((k) => k !== i)
    // The sine sits below the diagonal for x and z, above it for y (see `axisMatrix`).
    const sin = axis === 'y' ? m[a][b] : m[b][a]
    const angle = (Math.atan2(sin, m[a][a]) * 180) / Math.PI
    const rounded = Math.round(angle * 1e6) / 1e6
    return { axis, angle: Object.is(rounded, -0) ? 0 : rounded }
  }
  return null
}

interface ElementJson {
  rotation?: Record<string, unknown>
}

/**
 * The model JSON with its per-axis element rotations rewritten as single
 * axis rotations where possible. Returns the same object when nothing changes.
 */
export function normalizeElementRotations(json: unknown): unknown {
  if (typeof json !== 'object' || json === null) return json
  const elements = (json as { elements?: unknown }).elements
  if (!Array.isArray(elements)) return json
  let changed = false
  const out = elements.map((element: unknown) => {
    const rotation = (element as ElementJson | null)?.rotation
    if (!rotation || typeof rotation !== 'object' || 'axis' in rotation) return element
    const [x, y, z] = AXES.map((axis) => rotation[axis] ?? 0)
    if (![x, y, z].every((v) => typeof v === 'number' && Number.isFinite(v))) return element
    const single = singleAxisRotation(x as number, y as number, z as number)
    if (!single) return element
    changed = true
    const rest = Object.fromEntries(
      Object.entries(rotation).filter(([key]) => !(AXES as readonly string[]).includes(key)),
    )
    return { ...(element as object), rotation: { ...rest, ...single } }
  })
  return changed ? { ...json, elements: out } : json
}
