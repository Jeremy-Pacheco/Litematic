/**
 * Layer system logic, independent of the UI and of Three.js. A layer is one
 * Y level of the structure (0 = bottom).
 */

/**
 * Which layers are shown:
 * - `all`: the whole structure.
 * - `single`: only the current layer.
 * - `below`: the current layer and everything under it.
 * - `above`: the current layer and everything over it.
 * - `range`: the layers between `rangeMin` and `rangeMax`.
 */
export type LayerMode = 'all' | 'single' | 'below' | 'above' | 'range'
export const LAYER_MODES: readonly LayerMode[] = ['all', 'single', 'below', 'above', 'range']

/** Build order: `up` from the bottom layer, `down` from the top one. */
export type BuildDirection = 'up' | 'down'

/** Inclusive range of visible layers. */
export interface LayerRange {
  min: number
  max: number
}

export interface LayerSelection {
  mode: LayerMode
  current: number
  rangeMin: number
  rangeMax: number
}

export function clampLayer(y: number, height: number): number {
  if (height <= 0) return 0
  return Math.min(height - 1, Math.max(0, Math.round(y)))
}

/** Visible layers of a selection; `null` when every layer is visible. */
export function visibleRange(selection: LayerSelection, height: number): LayerRange | null {
  if (height <= 0) return null
  const top = height - 1
  const current = clampLayer(selection.current, height)
  let range: LayerRange
  switch (selection.mode) {
    case 'all':
      return null
    case 'single':
      range = { min: current, max: current }
      break
    case 'below':
      range = { min: 0, max: current }
      break
    case 'above':
      range = { min: current, max: top }
      break
    case 'range': {
      const a = clampLayer(selection.rangeMin, height)
      const b = clampLayer(selection.rangeMax, height)
      range = { min: Math.min(a, b), max: Math.max(a, b) }
      break
    }
  }
  return range.min === 0 && range.max === top ? null : range
}

export type LayerStatus = 'done' | 'current' | 'pending'

/** Build status of layer `y` when building in `direction` and working on `current`. */
export function layerStatus(y: number, current: number, direction: BuildDirection): LayerStatus {
  if (y === current) return 'current'
  const done = direction === 'up' ? y < current : y > current
  return done ? 'done' : 'pending'
}

export interface BuildProgress {
  /** Layers already built (before the current one in build order). */
  layersDone: number
  layers: number
  /** Blocks in the layers already built. */
  blocksDone: number
  blocks: number
  /** 0–1, by blocks (empty layers do not count). */
  fraction: number
}

/** Progress of a build that is working on `current`, from the blocks of each layer. */
export function buildProgress(
  layerBlocks: ArrayLike<number>,
  current: number,
  direction: BuildDirection,
): BuildProgress {
  const layers = layerBlocks.length
  let blocks = 0
  let blocksDone = 0
  let layersDone = 0
  for (let y = 0; y < layers; y++) {
    blocks += layerBlocks[y]
    if (layerStatus(y, current, direction) === 'done') {
      blocksDone += layerBlocks[y]
      layersDone++
    }
  }
  return { layersDone, layers, blocksDone, blocks, fraction: blocks ? blocksDone / blocks : 0 }
}

/** First layer to build in `direction`. */
export function startLayer(height: number, direction: BuildDirection): number {
  return direction === 'up' ? 0 : Math.max(0, height - 1)
}

/** The next layer in build order (`step` = 1) or the previous one (`step` = -1). */
export function stepLayer(
  current: number,
  step: 1 | -1,
  direction: BuildDirection,
  height: number,
): number {
  const delta = direction === 'up' ? step : -step
  return clampLayer(current + delta, height)
}
