import { describe, expect, it } from 'vitest'
import { BIOMES, biomeColors, colormapPixel, isBiomeId } from '../../src/lib/models/biomes'
import { parseViewerSettings } from '../../src/lib/stores/viewer.svelte'

/** A colormap whose color encodes the pixel, to check where it was sampled. */
const probe = (x: number, y: number) => (x << 8) | y

describe('colormapPixel', () => {
  it('samples like the game: downfall scaled by temperature, both clamped', () => {
    expect(colormapPixel(0.8, 0.4)).toEqual({ x: 50, y: 173 })
    expect(colormapPixel(2, 0)).toEqual({ x: 0, y: 255 })
    expect(colormapPixel(-1, 5)).toEqual({ x: 255, y: 255 })
  })
})

describe('biomeColors', () => {
  it('takes grass and foliage from the colormaps', () => {
    const plains = biomeColors('plains', probe, probe)
    expect(plains.grass).toEqual([0, 50 / 255, 173 / 255])
    expect(plains.water).toEqual([0x3f / 255, 0x76 / 255, 0xe4 / 255])
  })

  it('uses fixed colors where the game does, and darkens dark forest grass', () => {
    const swamp = biomeColors('swamp', probe, probe)
    expect(swamp.grass).toEqual([0x6a / 255, 0x70 / 255, 0x39 / 255])
    const plainsGrass = 0x91bd59
    const dark = biomeColors(
      'dark_forest',
      () => plainsGrass,
      () => null,
    )
    const expected = (((plainsGrass & 0xfefefe) + 0x28340a) >> 1) & 0xffffff
    expect(dark.grass[0]).toBeCloseTo(((expected >> 16) & 0xff) / 255)
    // Without a colormap, the game's default foliage color.
    expect(dark.foliage).toEqual([0x77 / 255, 0xab / 255, 0x2f / 255])
  })

  it('validates ids and remembers the choice', () => {
    expect(BIOMES.every(isBiomeId)).toBe(true)
    expect(isBiomeId('nether')).toBe(false)
    expect(parseViewerSettings('{"biome":"jungle"}').biome).toBe('jungle')
    expect(parseViewerSettings('{"biome":"nether"}').biome).toBe('plains')
  })
})
