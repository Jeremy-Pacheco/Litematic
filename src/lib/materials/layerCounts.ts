import type { Structure } from '../types/structure'

/**
 * Block counts per palette state for a range of layers, for the material
 * list of "the current layer" or "the visible layers".
 *
 * The first query builds a table of counts per layer and state in one pass
 * over the blocks; every later range is a sum over that table, so moving
 * through the layers does not scan the structure again. When the table would
 * be too large (huge palette × many layers), each query scans its layers
 * instead.
 */
export class LayerCounts {
  readonly #structure: Pick<Structure, 'size' | 'palette' | 'blocks' | 'blockCounts'>
  #table: Uint32Array | null = null

  constructor(structure: Pick<Structure, 'size' | 'palette' | 'blocks' | 'blockCounts'>) {
    this.#structure = structure
  }

  /** Counts per state of the layers `min`…`max` (inclusive). */
  forRange(min: number, max: number): Uint32Array {
    const { size, palette, blockCounts } = this.#structure
    const lo = Math.max(0, min)
    const hi = Math.min(size.y - 1, max)
    if (lo === 0 && hi === size.y - 1) return blockCounts
    const counts = new Uint32Array(palette.length)
    if (hi < lo) return counts

    const table = this.#tableOrNull()
    if (table) {
      for (let y = lo; y <= hi; y++) {
        const row = y * palette.length
        for (let s = 0; s < palette.length; s++) counts[s] += table[row + s]
      }
      return counts
    }
    const { blocks } = this.#structure
    const layer = size.x * size.z
    for (let i = lo * layer, end = (hi + 1) * layer; i < end; i++) counts[blocks[i]]++
    return counts
  }

  #tableOrNull(): Uint32Array | null {
    const { size, palette, blocks } = this.#structure
    if (size.y * palette.length > MAX_TABLE_ENTRIES) return null
    if (!this.#table) {
      const table = new Uint32Array(size.y * palette.length)
      const layer = size.x * size.z
      for (let y = 0, i = 0; y < size.y; y++) {
        const row = y * palette.length
        for (const end = i + layer; i < end; i++) table[row + blocks[i]]++
      }
      this.#table = table
    }
    return this.#table
  }
}

/** Largest layer × state table kept (16 MB). */
export const MAX_TABLE_ENTRIES = 4 * 1024 * 1024
