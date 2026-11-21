import { describe, expect, it } from 'vitest'
import {
  MAX_WORKERS,
  PARALLEL_MIN_BLOCKS,
  planMeshing,
  workerCount,
} from '../../src/lib/viewer/meshingPlan'

/** `rows` section rows of 16 layers, each layer with `perLayer(row)` blocks. */
const layers = (rows: number, perLayer: (row: number) => number) =>
  Array.from({ length: rows * 16 }, (_, y) => perLayer(Math.floor(y / 16)))

describe('workerCount', () => {
  it('uses one worker for small structures and leaves a core free', () => {
    expect(workerCount(PARALLEL_MIN_BLOCKS - 1, 16)).toBe(1)
    expect(workerCount(10_000_000, 16)).toBe(MAX_WORKERS)
    expect(workerCount(10_000_000, 3)).toBe(2)
    expect(workerCount(10_000_000, 1)).toBe(1)
  })
})

describe('planMeshing', () => {
  it('covers every row exactly once, in order', () => {
    const tasks = planMeshing(
      layers(10, () => 100),
      4,
    )
    expect(tasks).toHaveLength(4)
    expect(tasks[0].rows.from).toBe(0)
    expect(tasks.at(-1)!.rows.to).toBe(10)
    for (let i = 1; i < tasks.length; i++) expect(tasks[i].rows.from).toBe(tasks[i - 1].rows.to)
  })

  it('balances by blocks, not by rows', () => {
    // Dense ground (rows 0–1), empty sky above (rows 2–9).
    const tasks = planMeshing(
      layers(10, (row) => (row < 2 ? 10_000 : 0)),
      2,
    )
    expect(tasks[0].rows).toEqual({ from: 0, to: 1 })
    expect(tasks[1].rows).toEqual({ from: 1, to: 10 })
  })

  it('gives each band its layers plus one above and one below', () => {
    const [a, b] = planMeshing(
      layers(4, () => 1),
      2,
    )
    expect(a.layers).toEqual({ from: 0, to: 33 })
    expect(b.layers).toEqual({ from: 31, to: 64 })
  })

  it('never makes more bands than rows, and handles partial and empty heights', () => {
    expect(planMeshing(new Array(20).fill(5), 4)).toHaveLength(2)
    expect(planMeshing(new Array(20).fill(5), 4).at(-1)!.layers.to).toBe(20)
    expect(planMeshing([], 4)).toEqual([])
  })
})
