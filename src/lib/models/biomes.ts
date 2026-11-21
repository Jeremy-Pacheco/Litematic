/**
 * Biome tints. Structure files do not store biomes (Litematica does not save
 * them), so the user picks one for the whole structure. Grass and foliage
 * colors come from the game's own colormaps (`colormap/grass.png`,
 * `colormap/foliage.png`, also from a resource pack) at the biome's
 * temperature and downfall, as the game does; some biomes use fixed colors.
 */

export const BIOMES = [
  'plains',
  'forest',
  'birch_forest',
  'dark_forest',
  'jungle',
  'taiga',
  'snowy_plains',
  'savanna',
  'badlands',
  'swamp',
  'mangrove_swamp',
  'cherry_grove',
  'warm_ocean',
  'cold_ocean',
] as const

export type BiomeId = (typeof BIOMES)[number]
export const DEFAULT_BIOME: BiomeId = 'plains'

interface BiomeDefinition {
  temperature: number
  downfall: number
  water: number
  /** Fixed colors that replace the colormap. */
  grass?: number
  foliage?: number
  /** Dark forest darkens its grass color. */
  darkGrass?: boolean
}

/** Values of the game's biome definitions (data/minecraft/worldgen/biome). */
const DEFINITIONS: Readonly<Record<BiomeId, BiomeDefinition>> = {
  plains: { temperature: 0.8, downfall: 0.4, water: 0x3f76e4 },
  forest: { temperature: 0.7, downfall: 0.8, water: 0x3f76e4 },
  birch_forest: { temperature: 0.6, downfall: 0.6, water: 0x3f76e4 },
  dark_forest: { temperature: 0.7, downfall: 0.8, water: 0x3f76e4, darkGrass: true },
  jungle: { temperature: 0.95, downfall: 0.9, water: 0x3f76e4 },
  taiga: { temperature: 0.25, downfall: 0.8, water: 0x3f76e4 },
  snowy_plains: { temperature: 0, downfall: 0.5, water: 0x3f76e4 },
  savanna: { temperature: 2, downfall: 0, water: 0x3f76e4 },
  badlands: { temperature: 2, downfall: 0, water: 0x3f76e4, grass: 0x90814d, foliage: 0x9e814d },
  swamp: { temperature: 0.8, downfall: 0.9, water: 0x617b64, grass: 0x6a7039, foliage: 0x6a7039 },
  mangrove_swamp: {
    temperature: 0.8,
    downfall: 0.9,
    water: 0x3a7a6a,
    grass: 0x6a7039,
    foliage: 0x8db127,
  },
  cherry_grove: {
    temperature: 0.5,
    downfall: 0.8,
    water: 0x5db7ef,
    grass: 0xb6db61,
    foliage: 0xb6db61,
  },
  warm_ocean: { temperature: 0.5, downfall: 0.5, water: 0x43d5ee },
  cold_ocean: { temperature: 0.5, downfall: 0.5, water: 0x3d57d6 },
}

export function isBiomeId(value: unknown): value is BiomeId {
  return typeof value === 'string' && (BIOMES as readonly string[]).includes(value)
}

/**
 * Pixel of a 256 × 256 colormap for a temperature and downfall, as the game
 * computes it (both clamped to 0–1; downfall is scaled by temperature).
 */
export function colormapPixel(temperature: number, downfall: number): { x: number; y: number } {
  const t = Math.min(1, Math.max(0, temperature))
  const d = Math.min(1, Math.max(0, downfall)) * t
  return { x: Math.floor((1 - t) * 255), y: Math.floor((1 - d) * 255) }
}

/** A colormap: returns the RGB color (0xRRGGBB) at a pixel, or null without one. */
export type Colormap = (x: number, y: number) => number | null

export interface BiomeColors {
  /** RGB 0–1 tints. */
  grass: [number, number, number]
  foliage: [number, number, number]
  water: [number, number, number]
}

/** Tints of a biome from the colormaps (with the game's fallbacks when missing). */
export function biomeColors(id: BiomeId, grassMap: Colormap, foliageMap: Colormap): BiomeColors {
  const biome = DEFINITIONS[id]
  const { x, y } = colormapPixel(biome.temperature, biome.downfall)
  let grass = biome.grass ?? grassMap(x, y) ?? 0x91bd59
  const foliage = biome.foliage ?? foliageMap(x, y) ?? 0x77ab2f
  if (biome.darkGrass) grass = (((grass & 0xfefefe) + 0x28340a) >> 1) & 0xffffff
  return { grass: rgb(grass), foliage: rgb(foliage), water: rgb(biome.water) }
}

function rgb(color: number): [number, number, number] {
  return [((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255]
}
