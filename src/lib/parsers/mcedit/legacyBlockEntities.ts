import { DYE_COLORS } from '../../constants/dyes'
import { isNbtCompound, isNbtList, type NbtCompound } from '../../types/nbt'
import { blockIndex, type BlockEntity, type BlockState, type Vec3 } from '../../types/structure'
import { createBlockState } from '../blockState'
import { getInteger } from '../nbt/access'
import type { PaletteBuilder } from '../structureBuilder'

/**
 * Before 1.13 part of what a block looks like was stored in its block entity,
 * not in `id:meta`: the color of beds and banners, the kind of skull, the
 * plant in a flower pot and the note of a note block. The legacy table gives
 * the default for those (red bed, white banner, skeleton skull, empty pot), so
 * this pass reads the block entities and rewrites the block at each position,
 * as Minecraft's 1.13 data fixer does.
 *
 * It also converts banner pattern colors, which were saved as dye damage
 * values (0 = black) and are read elsewhere in the 1.13+ order (0 = white).
 */

const MC = 'minecraft:'

/** Skull types (`SkullType`) in order, as floor and wall block ids. */
const SKULLS: readonly (readonly [string, string])[] = [
  ['skeleton_skull', 'skeleton_wall_skull'],
  ['wither_skeleton_skull', 'wither_skeleton_wall_skull'],
  ['zombie_head', 'zombie_wall_head'],
  ['player_head', 'player_wall_head'],
  ['creeper_head', 'creeper_wall_head'],
  ['dragon_head', 'dragon_wall_head'],
]

const SAPLINGS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak']
const RED_FLOWERS = [
  'poppy',
  'blue_orchid',
  'allium',
  'azure_bluet',
  'red_tulip',
  'orange_tulip',
  'white_tulip',
  'pink_tulip',
  'oxeye_daisy',
]

/** Numeric item ids that a flower pot could hold (pots saved before 1.8). */
const POT_ITEM_IDS: Readonly<Record<number, string>> = {
  6: 'sapling',
  31: 'tallgrass',
  32: 'deadbush',
  37: 'yellow_flower',
  38: 'red_flower',
  39: 'brown_mushroom',
  40: 'red_mushroom',
  81: 'cactus',
}

/** Highest note of a note block. */
const MAX_NOTE = 24

/**
 * Rewrites the blocks whose look depends on their block entity. Returns the
 * positions that were resolved this way.
 */
export function applyLegacyBlockEntities(
  blocks: Uint16Array,
  size: Vec3,
  palette: PaletteBuilder,
  blockEntities: readonly BlockEntity[],
): Set<number> {
  const resolved = new Set<number>()
  for (const entity of blockEntities) {
    const { x, y, z } = entity.pos
    const position = blockIndex(size, x, y, z)
    const state = palette.states[blocks[position]]
    const fixed = fixState(normalizeId(entity.id), state, entity.nbt)
    if (fixed === undefined) continue
    resolved.add(position)
    if (fixed) blocks[position] = palette.add(fixed)
  }
  return resolved
}

/** `minecraft:flower_pot`, `FlowerPot` → `flowerpot`. */
function normalizeId(id: string): string {
  return id
    .replace(/^minecraft:/, '')
    .replace(/_/g, '')
    .toLowerCase()
}

/**
 * New state for a block entity of type `kind` sitting on `state`.
 * `undefined`: not a block entity this pass handles, or not on the block it
 * belongs to. `null`: handled, the state stays as it is.
 */
function fixState(
  kind: string,
  state: BlockState,
  nbt: NbtCompound,
): BlockState | null | undefined {
  const name = state.name.startsWith(MC) ? state.name.slice(MC.length) : ''
  switch (kind) {
    case 'bed':
      return name === 'red_bed' ? bedState(state, nbt) : undefined
    case 'banner':
      if (name !== 'white_banner' && name !== 'white_wall_banner') return undefined
      convertPatternColors(nbt)
      return bannerState(state, nbt)
    case 'skull':
      return name === 'skeleton_skull' || name === 'skeleton_wall_skull'
        ? skullState(state, nbt)
        : undefined
    case 'flowerpot':
      return name === 'flower_pot' || name.startsWith('potted_') ? potState(nbt) : undefined
    case 'music':
    case 'noteblock':
      return name === 'note_block' ? noteState(state, nbt) : undefined
    default:
      return undefined
  }
}

function withName(state: BlockState, name: string, extra: Record<string, string> = {}): BlockState {
  return createBlockState(MC + name, Object.entries({ ...state.properties, ...extra }))
}

/** Beds saved before 1.12 have no block entity and are red, the default. */
function bedState(state: BlockState, nbt: NbtCompound): BlockState | null {
  const color = DYE_COLORS[getInteger(nbt, 'color') ?? -1]
  return color && color !== 'red' ? withName(state, `${color}_bed`) : null
}

/** `Base` is a dye damage value: 0 is black, 15 is white. */
function bannerState(state: BlockState, nbt: NbtCompound): BlockState | null {
  const color = DYE_COLORS[15 - (getInteger(nbt, 'Base') ?? 0)]
  if (!color || color === 'white') return null
  return withName(state, state.name.slice(MC.length).replace(/^white_/, `${color}_`))
}

/** Pattern colors are dye damage values too; the renderer reads 1.13+ ids. */
function convertPatternColors(nbt: NbtCompound): void {
  const patterns = nbt.get('Patterns')
  if (!isNbtList(patterns)) return
  for (const item of patterns.items) {
    if (!isNbtCompound(item)) continue
    const color = item.get('Color')
    if (typeof color === 'number' && Number.isInteger(color) && color >= 0 && color <= 15) {
      item.set('Color', 15 - color)
    }
  }
}

/** `SkullType` picks the head; `Rot` (0–15) is the rotation of a floor skull. */
function skullState(state: BlockState, nbt: NbtCompound): BlockState | null {
  const type = SKULLS[getInteger(nbt, 'SkullType') ?? 0] ?? SKULLS[0]
  if (state.name === `${MC}skeleton_wall_skull`) {
    return type === SKULLS[0] ? null : withName(state, type[1])
  }
  const rot = getInteger(nbt, 'Rot')
  const rotation = rot !== undefined && rot >= 0 && rot <= 15 ? String(rot) : undefined
  return withName(state, type[0], rotation === undefined ? {} : { rotation })
}

/** `Item` (a string id, or a number before 1.8) and `Data` name the potted plant. */
function potState(nbt: NbtCompound): BlockState {
  const raw = nbt.get('Item')
  const item =
    typeof raw === 'string'
      ? raw.replace(/^minecraft:/, '')
      : typeof raw === 'number'
        ? POT_ITEM_IDS[raw]
        : undefined
  const plant = item ? pottedPlant(item, getInteger(nbt, 'Data') ?? 0) : null
  return createBlockState(MC + (plant ? `potted_${plant}` : 'flower_pot'), [])
}

function pottedPlant(item: string, data: number): string | null {
  switch (item) {
    case 'sapling':
      return SAPLINGS[data] ? `${SAPLINGS[data]}_sapling` : null
    case 'red_flower':
      return RED_FLOWERS[data] ?? null
    case 'yellow_flower':
      return 'dandelion'
    case 'red_mushroom':
    case 'brown_mushroom':
    case 'cactus':
      return item
    case 'deadbush':
      return 'dead_bush'
    case 'tallgrass':
      return data === 2 ? 'fern' : null
    default:
      return null
  }
}

/** The instrument depends on the block below and is set by the neighbor pass. */
function noteState(state: BlockState, nbt: NbtCompound): BlockState | null {
  const note = getInteger(nbt, 'note')
  if (note === undefined || note < 0 || note > MAX_NOTE) return null
  return withName(state, 'note_block', { note: String(note) })
}
