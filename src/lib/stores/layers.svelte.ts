import { readStorage, writeStorage } from '../utils/storage'
import {
  clampLayer,
  LAYER_MODES,
  startLayer,
  stepLayer,
  visibleRange,
  type BuildDirection,
  type LayerMode,
  type LayerRange,
} from '../viewer/layers'

const STORAGE_KEY = 'lv:layers'

interface LayerPreferences {
  mode: LayerMode
  direction: BuildDirection
}

const DEFAULTS: LayerPreferences = { mode: 'all', direction: 'up' }

/** Parses the saved mode and direction, falling back to defaults. */
export function parseLayerPreferences(raw: string | null): LayerPreferences {
  let data: unknown
  try {
    data = raw ? JSON.parse(raw) : null
  } catch {
    data = null
  }
  const v = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>
  return {
    mode: LAYER_MODES.includes(v.mode as LayerMode) ? (v.mode as LayerMode) : DEFAULTS.mode,
    direction: v.direction === 'down' ? 'down' : DEFAULTS.direction,
  }
}

/**
 * Layer selection of the structure in the viewer. The mode and the build
 * direction are remembered; the current layer and the range start over with
 * every structure.
 */
class LayerState {
  height = $state(0)
  mode = $state<LayerMode>(DEFAULTS.mode)
  direction = $state<BuildDirection>(DEFAULTS.direction)
  current = $state(0)
  rangeMin = $state(0)
  rangeMax = $state(0)

  /** Visible layers, or `null` for the whole structure. */
  readonly range: LayerRange | null = $derived(
    visibleRange(
      { mode: this.mode, current: this.current, rangeMin: this.rangeMin, rangeMax: this.rangeMax },
      this.height,
    ),
  )

  init(): void {
    const saved = parseLayerPreferences(readStorage(STORAGE_KEY))
    this.mode = saved.mode
    this.direction = saved.direction
  }

  /** Starts over for a structure `height` layers tall. */
  reset(height: number): void {
    this.height = height
    this.current = startLayer(height, this.direction)
    this.rangeMin = 0
    this.rangeMax = Math.max(0, height - 1)
  }

  setMode(mode: LayerMode): void {
    this.mode = mode
    this.#save()
  }

  setDirection(direction: BuildDirection): void {
    this.direction = direction
    this.#save()
  }

  setCurrent(y: number): void {
    this.current = clampLayer(y, this.height)
  }

  setRange(min: number, max: number): void {
    this.rangeMin = clampLayer(min, this.height)
    this.rangeMax = clampLayer(max, this.height)
  }

  /** Moves to the next layer in build order. */
  next(): void {
    this.current = stepLayer(this.current, 1, this.direction, this.height)
  }

  /** Moves back to the previous layer in build order. */
  previous(): void {
    this.current = stepLayer(this.current, -1, this.direction, this.height)
  }

  #save(): void {
    const preferences: LayerPreferences = { mode: this.mode, direction: this.direction }
    writeStorage(STORAGE_KEY, JSON.stringify(preferences))
  }
}

export const layers = new LayerState()
