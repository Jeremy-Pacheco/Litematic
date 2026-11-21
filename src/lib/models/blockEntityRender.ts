import { DYE_COLORS as DYES } from '../constants/dyes'
import { isNbtCompound, isNbtList, type NbtCompound } from '../types/nbt'
import { blockIndex, type BlockState, type Structure } from '../types/structure'

/**
 * Block entity data that changes how a block looks (for now, the patterns of
 * banners). The renderer bakes one palette entry per state, so a block with
 * such data gets its own "variant" entry: an extra palette index used only for
 * drawing. The structure's own block array, palette and counts are untouched,
 * so materials, the inspector and picking are not affected.
 */

export interface BannerLayer {
  /** Pattern id path, e.g. `stripe_bottom` (texture `entity/banner/<pattern>`). */
  pattern: string
  /** Dye color name, e.g. `red`. */
  color: string
}

export interface BlockRenderData {
  patterns: BannerLayer[]
}

export interface RenderVariants {
  /** The structure palette followed by one entry per variant. */
  palette: BlockState[]
  /** Render data per palette index (`null` for plain states). */
  data: (BlockRenderData | null)[]
  /** Block array to mesh: the structure's own when there are no variants. */
  blocks: Uint16Array | Uint32Array
  variants: number
}

/** Pattern codes of banners saved before 1.20.5. */
const LEGACY_PATTERNS: Readonly<Record<string, string>> = {
  b: 'base',
  bl: 'square_bottom_left',
  br: 'square_bottom_right',
  tl: 'square_top_left',
  tr: 'square_top_right',
  bs: 'stripe_bottom',
  ts: 'stripe_top',
  ls: 'stripe_left',
  rs: 'stripe_right',
  cs: 'stripe_center',
  ms: 'stripe_middle',
  drs: 'stripe_downright',
  dls: 'stripe_downleft',
  ss: 'small_stripes',
  cr: 'cross',
  sc: 'straight_cross',
  bt: 'triangle_bottom',
  tt: 'triangle_top',
  bts: 'triangles_bottom',
  tts: 'triangles_top',
  ld: 'diagonal_left',
  rd: 'diagonal_up_right',
  lud: 'diagonal_up_left',
  rud: 'diagonal_right',
  mc: 'circle',
  mr: 'rhombus',
  vh: 'half_vertical',
  hh: 'half_horizontal',
  vhr: 'half_vertical_right',
  hhb: 'half_horizontal_bottom',
  bo: 'border',
  cbo: 'curly_border',
  gra: 'gradient',
  gru: 'gradient_up',
  bri: 'bricks',
  glb: 'globe',
  cre: 'creeper',
  sku: 'skull',
  flo: 'flower',
  moj: 'mojang',
  pig: 'piglin',
}

/** Banners have at most 6 patterns in survival; commands allow more. */
const MAX_LAYERS = 16
/** Pattern path: lowercase segments, no dots (so no `..`). */
const SAFE_ID = /^[a-z0-9_]+(?:\/[a-z0-9_]+)*$/

/**
 * Patterns of a banner block entity, in any saved format:
 * - 1.20.5+: `patterns: [{ pattern: "minecraft:stripe_top" | { asset_id }, color: "red" }]`
 * - older: `Patterns: [{ Pattern: "ts", Color: 14 }]`
 * Sponge v3 keeps the data under `Data`. Returns `null` when there are none.
 */
export function bannerPatterns(nbt: NbtCompound): BannerLayer[] | null {
  const data = isNbtCompound(nbt.get('Data')) ? (nbt.get('Data') as NbtCompound) : nbt
  const modern = data.get('patterns')
  const legacy = data.get('Patterns')
  const list = isNbtList(modern) ? modern : isNbtList(legacy) ? legacy : null
  if (!list) return null

  const layers: BannerLayer[] = []
  for (const item of list.items.slice(0, MAX_LAYERS)) {
    if (!isNbtCompound(item)) continue
    const layer = isNbtList(modern) ? modernLayer(item) : legacyLayer(item)
    if (layer) layers.push(layer)
  }
  return layers.length > 0 ? layers : null
}

function modernLayer(item: NbtCompound): BannerLayer | null {
  const raw = item.get('pattern')
  const id = typeof raw === 'string' ? raw : isNbtCompound(raw) ? raw.get('asset_id') : null
  const color = item.get('color')
  if (typeof id !== 'string' || typeof color !== 'string' || !DYES.includes(color)) return null
  const pattern = id.replace(/^minecraft:/, '')
  return SAFE_ID.test(pattern) ? { pattern, color } : null
}

function legacyLayer(item: NbtCompound): BannerLayer | null {
  const code = item.get('Pattern')
  const color = item.get('Color')
  const pattern = typeof code === 'string' ? LEGACY_PATTERNS[code] : undefined
  if (!pattern || typeof color !== 'number' || !DYES[color]) return null
  return { pattern, color: DYES[color] }
}

/** Render data of a block entity, or `null` when it does not change the look. */
export function renderDataOf(id: string, nbt: NbtCompound): BlockRenderData | null {
  if (!/(^|:)banner$/.test(id)) return null
  const patterns = bannerPatterns(nbt)
  return patterns ? { patterns } : null
}

/**
 * Adds a palette entry for every distinct (state, render data) pair and
 * remaps those positions in a copy of the block array.
 */
export function buildRenderVariants(
  structure: Pick<Structure, 'size' | 'palette' | 'blocks' | 'blockEntities'>,
): RenderVariants {
  const palette = [...structure.palette]
  const data: (BlockRenderData | null)[] = palette.map(() => null)
  const keys = new Map<string, number>()
  const changes: [number, number][] = []

  for (const entity of structure.blockEntities) {
    const render = renderDataOf(entity.id, entity.nbt)
    if (!render) continue
    const { x, y, z } = entity.pos
    const { size } = structure
    if (x < 0 || y < 0 || z < 0 || x >= size.x || y >= size.y || z >= size.z) continue
    const position = blockIndex(size, x, y, z)
    const state = structure.blocks[position]
    if (state === 0) continue
    const key = `${state}|${JSON.stringify(render)}`
    let variant = keys.get(key)
    if (variant === undefined) {
      variant = palette.length
      keys.set(key, variant)
      palette.push(structure.palette[state])
      data.push(render)
    }
    changes.push([position, variant])
  }

  if (changes.length === 0) {
    return { palette, data, blocks: structure.blocks, variants: 0 }
  }
  const wide = palette.length > 0xffff
  const blocks = wide ? Uint32Array.from(structure.blocks) : structure.blocks.slice()
  for (const [position, variant] of changes) blocks[position] = variant
  return { palette, data, blocks, variants: keys.size }
}
