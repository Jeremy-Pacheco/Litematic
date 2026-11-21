import { SECTION_SIZE } from './mesher'

/**
 * How the meshing of a structure is split between workers: each worker takes
 * a band of section rows (along Y) with about the same number of blocks, so
 * none of them waits on empty sky while another meshes the ground.
 */

export interface MeshingTask {
  /** Section rows to mesh: [from, to). */
  rows: { from: number; to: number }
  /** Layers the worker needs: its own plus one above and one below, [from, to). */
  layers: { from: number; to: number }
}

/** Below this many blocks a single worker is faster than starting several. */
export const PARALLEL_MIN_BLOCKS = 200_000
export const MAX_WORKERS = 4

/** Workers to use for a structure on a machine with `cores` logical cores. */
export function workerCount(blocks: number, cores: number): number {
  if (blocks < PARALLEL_MIN_BLOCKS) return 1
  return Math.max(1, Math.min(MAX_WORKERS, cores - 1))
}

/**
 * Splits the section rows into at most `parts` bands of similar weight.
 * `layerBlocks[y]` is the number of blocks of layer `y`.
 */
export function planMeshing(layerBlocks: ArrayLike<number>, parts: number): MeshingTask[] {
  const height = layerBlocks.length
  const rows = Math.ceil(height / SECTION_SIZE)
  if (rows === 0) return []
  // Every row costs something even when empty (it is still scanned).
  const weights = Array.from({ length: rows }, (_, row) => {
    let blocks = 1
    for (let y = row * SECTION_SIZE; y < Math.min(height, (row + 1) * SECTION_SIZE); y++) {
      blocks += layerBlocks[y]
    }
    return blocks
  })
  const total = weights.reduce((a, b) => a + b, 0)
  const count = Math.max(1, Math.min(parts, rows))

  const tasks: MeshingTask[] = []
  let from = 0
  let acc = 0
  for (let row = 0; row < rows; row++) {
    acc += weights[row]
    const remainingTasks = count - tasks.length - 1
    const remainingRows = rows - row - 1
    // Close the band where it is closest to its share of the weight (adding
    // the next row would overshoot more), keeping a row for each band left.
    const target = (total * (tasks.length + 1)) / count
    const next = row + 1 < rows ? weights[row + 1] : 0
    const closest = acc >= target || acc + next - target > target - acc
    if (remainingTasks > 0 && (closest || remainingRows === remainingTasks)) {
      tasks.push(task(from, row + 1, height))
      from = row + 1
    }
  }
  tasks.push(task(from, rows, height))
  return tasks
}

function task(from: number, to: number, height: number): MeshingTask {
  return {
    rows: { from, to },
    layers: {
      from: Math.max(0, from * SECTION_SIZE - 1),
      to: Math.min(height, to * SECTION_SIZE + 1),
    },
  }
}
