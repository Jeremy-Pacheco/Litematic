import { describe, expect, it } from 'vitest'
import { parseLayerPreferences } from '../../src/lib/stores/layers.svelte'
import { parseViewerSettings } from '../../src/lib/stores/viewer.svelte'
import {
  buildProgress,
  clampLayer,
  layerStatus,
  startLayer,
  stepLayer,
  visibleRange,
  type LayerSelection,
} from '../../src/lib/viewer/layers'

const select = (s: Partial<LayerSelection>): LayerSelection => ({
  mode: 'all',
  current: 0,
  rangeMin: 0,
  rangeMax: 0,
  ...s,
})

describe('visibleRange', () => {
  it('shows everything in "all" mode', () => {
    expect(visibleRange(select({ mode: 'all', current: 3 }), 10)).toBeNull()
  })

  it('handles single, below and above', () => {
    expect(visibleRange(select({ mode: 'single', current: 3 }), 10)).toEqual({ min: 3, max: 3 })
    expect(visibleRange(select({ mode: 'below', current: 3 }), 10)).toEqual({ min: 0, max: 3 })
    expect(visibleRange(select({ mode: 'above', current: 3 }), 10)).toEqual({ min: 3, max: 9 })
  })

  it('orders and clamps a range', () => {
    const range = visibleRange(select({ mode: 'range', rangeMin: 12, rangeMax: 2 }), 10)
    expect(range).toEqual({ min: 2, max: 9 })
  })

  it('returns null when the selection covers every layer', () => {
    expect(visibleRange(select({ mode: 'below', current: 9 }), 10)).toBeNull()
    expect(visibleRange(select({ mode: 'above', current: 0 }), 10)).toBeNull()
    expect(visibleRange(select({ mode: 'single', current: 0 }), 1)).toBeNull()
  })

  it('clamps the current layer', () => {
    expect(visibleRange(select({ mode: 'single', current: 50 }), 10)).toEqual({ min: 9, max: 9 })
    expect(clampLayer(-3, 10)).toBe(0)
    expect(clampLayer(4, 0)).toBe(0)
  })
})

describe('build order', () => {
  it('marks layers done in the build direction', () => {
    expect([0, 1, 2, 3].map((y) => layerStatus(y, 2, 'up'))).toEqual([
      'done',
      'done',
      'current',
      'pending',
    ])
    expect([0, 1, 2, 3].map((y) => layerStatus(y, 2, 'down'))).toEqual([
      'pending',
      'pending',
      'current',
      'done',
    ])
  })

  it('starts at the bottom or the top and steps in build order', () => {
    expect(startLayer(10, 'up')).toBe(0)
    expect(startLayer(10, 'down')).toBe(9)
    expect(stepLayer(4, 1, 'up', 10)).toBe(5)
    expect(stepLayer(4, 1, 'down', 10)).toBe(3)
    expect(stepLayer(9, 1, 'up', 10)).toBe(9)
  })

  it('measures progress by blocks, so empty layers do not count', () => {
    const progress = buildProgress(new Uint32Array([30, 0, 10, 60]), 2, 'up')
    expect(progress).toEqual({
      layersDone: 2,
      layers: 4,
      blocksDone: 30,
      blocks: 100,
      fraction: 0.3,
    })
    expect(buildProgress(new Uint32Array([0, 0]), 1, 'up').fraction).toBe(0)
  })
})

describe('saved preferences', () => {
  it('reads valid layer preferences and ignores invalid ones', () => {
    expect(parseLayerPreferences('{"mode":"single","direction":"down"}')).toEqual({
      mode: 'single',
      direction: 'down',
    })
    expect(parseLayerPreferences('{"mode":"nope","direction":3}')).toEqual({
      mode: 'all',
      direction: 'up',
    })
    expect(parseLayerPreferences('not json')).toEqual({ mode: 'all', direction: 'up' })
  })

  it('remembers whether the layer panel is open', () => {
    expect(parseViewerSettings('{"layersOpen":false}').layersOpen).toBe(false)
    expect(parseViewerSettings(null).layersOpen).toBe(true)
  })
})
