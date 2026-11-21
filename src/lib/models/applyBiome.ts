import { BlockColors } from 'deepslate/render'
import { biomeColors, type BiomeColors, type BiomeId, type Colormap } from './biomes'

/**
 * Sets Deepslate's block tints (grass, foliage, water) to a biome's colors
 * before baking. `BlockColors` is a module-level table, so this runs in the
 * models worker, which bakes one palette and ends.
 */

type Tint = keyof BiomeColors
type Rgb = [number, number, number]

/** Deepslate's default tints, used to find which blocks take which tint. */
const DEFAULTS: Readonly<Record<Tint, Rgb>> = {
  grass: [124 / 255, 189 / 255, 107 / 255],
  foliage: rgb(4764952),
  water: rgb(4159204),
}

let tintOfBlock: Map<string, Tint> | null = null

/** Blocks tinted like grass, foliage or water (read once, before any change). */
function classify(): Map<string, Tint> {
  if (tintOfBlock) return tintOfBlock
  tintOfBlock = new Map()
  for (const [block, color] of Object.entries(BlockColors)) {
    const value = color({})
    for (const tint of Object.keys(DEFAULTS) as Tint[]) {
      if (sameColor(value, DEFAULTS[tint])) tintOfBlock.set(block, tint)
    }
  }
  return tintOfBlock
}

export async function applyBiome(
  biome: BiomeId,
  files: ReadonlyMap<string, Uint8Array>,
): Promise<BiomeColors> {
  const [grassMap, foliageMap] = await Promise.all([
    loadColormap(files.get('assets/minecraft/textures/colormap/grass.png')),
    loadColormap(files.get('assets/minecraft/textures/colormap/foliage.png')),
  ])
  const colors = biomeColors(biome, grassMap, foliageMap)
  for (const [block, tint] of classify()) BlockColors[block] = () => colors[tint]
  return colors
}

/** Reads a colormap PNG; without it (or if it cannot be decoded) every lookup is null. */
async function loadColormap(bytes: Uint8Array | undefined): Promise<Colormap> {
  if (!bytes) return () => null
  try {
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/png' }))
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return () => null
    ctx.drawImage(bitmap, 0, 0)
    const { data, width, height } = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
    bitmap.close()
    return (x, y) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return null
      const i = (y * width + x) * 4
      return (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]
    }
  } catch {
    return () => null
  }
}

function rgb(color: number): Rgb {
  return [((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255]
}

function sameColor(a: readonly number[], b: readonly number[]): boolean {
  return a.length === 3 && a.every((v, i) => Math.abs(v - b[i]) < 1e-6)
}
