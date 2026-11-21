import { isAirId } from '../parsers/blockState'
import type { BlockState } from '../types/structure'

/**
 * Translation of a placed block (state) into the items needed to place it.
 *
 * A placed block does not always correspond to one item of the same id: wall
 * variants, two-block-tall blocks, states that hold several items (slabs,
 * candles…), crops planted from seeds, pots with a plant, technical blocks…
 * Each rule below covers one of those cases.
 */

export type MaterialCategory =
  /** Normal items, obtainable in survival. */
  | 'item'
  /** Fluid sources, placed with a bucket. */
  | 'fluid'
  /** Not obtainable in survival (portals, fire, bedrock, command blocks…). */
  | 'unobtainable'

export interface ItemAmount {
  /** Namespaced item id, e.g. `minecraft:torch`. */
  item: string
  count: number
  category: MaterialCategory
}

const MC = 'minecraft:'

/** Parts of other blocks that are not placed on their own. */
const TECHNICAL = new Set(['piston_head', 'moving_piston'])

/** Blocks that cannot be obtained as items in survival. */
const UNOBTAINABLE = new Set([
  'bedrock',
  'barrier',
  'light',
  'structure_void',
  'structure_block',
  'jigsaw',
  'command_block',
  'chain_command_block',
  'repeating_command_block',
  'end_portal_frame',
  'end_portal',
  'end_gateway',
  'nether_portal',
  'fire',
  'soul_fire',
  'spawner',
  'trial_spawner',
  'vault',
  'budding_amethyst',
  'reinforced_deepslate',
  'petrified_oak_slab',
  'frosted_ice',
  'chorus_plant',
  'test_block',
  'test_instance_block',
])

/** Block id → the item that places it, when they differ (and the item is unique). */
const ITEM_FOR_BLOCK: Readonly<Record<string, string>> = {
  wheat: 'wheat_seeds',
  carrots: 'carrot',
  potatoes: 'potato',
  beetroots: 'beetroot_seeds',
  melon_stem: 'melon_seeds',
  attached_melon_stem: 'melon_seeds',
  pumpkin_stem: 'pumpkin_seeds',
  attached_pumpkin_stem: 'pumpkin_seeds',
  cocoa: 'cocoa_beans',
  sweet_berry_bush: 'sweet_berries',
  torchflower_crop: 'torchflower_seeds',
  pitcher_crop: 'pitcher_pod',
  cave_vines: 'glow_berries',
  cave_vines_plant: 'glow_berries',
  kelp_plant: 'kelp',
  twisting_vines_plant: 'twisting_vines',
  weeping_vines_plant: 'weeping_vines',
  bamboo_sapling: 'bamboo',
  big_dripleaf_stem: 'big_dripleaf',
  tall_seagrass: 'seagrass',
  redstone_wire: 'redstone',
  tripwire: 'string',
  wall_torch: 'torch',
  // Shaped from dirt with a hoe or a shovel.
  farmland: 'dirt',
  dirt_path: 'dirt',
  // Filled cauldrons are placed as an empty cauldron.
  water_cauldron: 'cauldron',
  lava_cauldron: 'cauldron',
  powder_snow_cauldron: 'cauldron',
  powder_snow: 'powder_snow_bucket',
}

/** Property that holds how many items one block contains. */
const AMOUNT_PROPERTY: Readonly<Record<string, string>> = {
  sea_pickle: 'pickles',
  turtle_egg: 'eggs',
  snow: 'layers',
  pink_petals: 'flower_amount',
  wildflowers: 'flower_amount',
  leaf_litter: 'segment_amount',
}

/** Pots with a plant whose item name differs from the pot suffix. */
const POTTED_PLANT: Readonly<Record<string, string>> = {
  azalea_bush: 'azalea',
  flowering_azalea_bush: 'flowering_azalea',
}

export function blockToItems(state: BlockState): ItemAmount[] {
  const { name, properties } = state
  if (isAirId(name)) return []
  if (!name.startsWith(MC)) return [item(name, 1)] // modded blocks: same id
  const id = name.slice(MC.length)

  if (TECHNICAL.has(id)) return []
  if (UNOBTAINABLE.has(id)) return [{ item: name, count: 1, category: 'unobtainable' }]

  // Fluids: only sources count, as buckets. Bubble columns are water sources.
  if (id === 'water' || id === 'lava') {
    return properties.level === undefined || properties.level === '0'
      ? [{ item: `${MC}${id}_bucket`, count: 1, category: 'fluid' }]
      : []
  }
  if (id === 'bubble_column') return [{ item: `${MC}water_bucket`, count: 1, category: 'fluid' }]

  // Two-block-tall blocks (doors, tall flowers…) use half=upper/lower; only the
  // lower half counts. (Stairs and trapdoors use half=top/bottom instead.)
  // Beds use part=head/foot; only the foot counts.
  if (properties.half === 'upper') return []
  if (id.endsWith('_bed') && properties.part === 'head') return []

  if (id.endsWith('_slab') && properties.type === 'double') return [item(name, 2)]

  if (id.startsWith('potted_')) {
    const plant = id.slice('potted_'.length)
    return [item(`${MC}flower_pot`, 1), item(`${MC}${POTTED_PLANT[plant] ?? plant}`, 1)]
  }

  if (id.endsWith('candle_cake')) {
    const candle = id === 'candle_cake' ? 'candle' : id.slice(0, -'_cake'.length)
    return [item(`${MC}cake`, 1), item(`${MC}${candle}`, 1)]
  }

  if (id.endsWith('candle') && properties.candles !== undefined) {
    return [item(name, amount(properties.candles))]
  }
  const amountKey = AMOUNT_PROPERTY[id]
  if (amountKey) return [item(name, amount(properties[amountKey]))]

  const mapped = ITEM_FOR_BLOCK[id]
  if (mapped) return [item(`${MC}${mapped}`, 1)]

  // Wall variants: oak_wall_sign → oak_sign, skeleton_wall_skull →
  // skeleton_skull, tube_coral_wall_fan → tube_coral_fan… Wall blocks such
  // as cobblestone_wall end in "_wall" and are not affected.
  if (id.includes('_wall_')) return [item(`${MC}${id.replace('_wall_', '_')}`, 1)]

  return [item(name, 1)]
}

function item(id: string, count: number): ItemAmount {
  return { item: id, count, category: 'item' }
}

/** A positive integer amount from a property, or 1 if it is missing or invalid. */
function amount(value: string | undefined): number {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : 1
}
