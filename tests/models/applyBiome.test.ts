import { BlockColors } from 'deepslate/render'
import { describe, expect, it } from 'vitest'
import { applyBiome } from '../../src/lib/models/applyBiome'

const hex = (rgb: number[]) =>
  rgb
    .map((c) =>
      Math.round(c * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')

describe('applyBiome', () => {
  it('replaces the grass, foliage and water tints of the blocks that use them', async () => {
    // No colormaps here: cherry grove uses fixed colors anyway.
    await applyBiome('cherry_grove', new Map())
    expect(hex(BlockColors.grass_block({}))).toBe('b6db61')
    expect(hex(BlockColors.short_grass({}))).toBe('b6db61')
    expect(hex(BlockColors.oak_leaves({}))).toBe('b6db61')
    expect(hex(BlockColors.water({}))).toBe('5db7ef')
    // Spruce and birch leaves keep their own fixed colors, as in the game.
    expect(hex(BlockColors.spruce_leaves({}))).toBe('619961')

    await applyBiome('swamp', new Map())
    expect(hex(BlockColors.grass_block({}))).toBe('6a7039')
    expect(hex(BlockColors.water({}))).toBe('617b64')
  })
})
