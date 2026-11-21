import type { BlockState } from '../types/structure'
import { createBlockState } from './blockState'

/**
 * Brings a block state saved by an older Minecraft (1.13 or later) up to the
 * names and properties of the current game resources, as the game's data
 * fixers do when it opens an old world. Applied once per palette entry.
 *
 * Every rule but one checks for the old name or property, so running it on a
 * current state changes nothing. The exception is `stone_slab`, whose meaning
 * changed: it is only renamed when the data version says the file is from
 * 1.13 (see `SMOOTH_STONE_SLAB_RENAME`).
 *
 * Only changes between releases are covered (not those that only existed in
 * snapshots). States from before 1.13 ("flattening") use other names and are
 * not handled here.
 */

const MC = 'minecraft:'

/**
 * First data version with flattened block ids (snapshot 17w47a, before 1.13
 * at 1519). Files older than this use 1.12 names such as
 * `minecraft:stone[variant=granite]`, which this module does not handle.
 */
export const DATA_VERSION_FLATTENING = 1451

/** Last data version of 1.13 (1.13.2). `stone_slab` was the smooth stone slab up to here. */
export const SMOOTH_STONE_SLAB_RENAME = 1631

/** Plain renames: the old id does not exist in later versions. */
const RENAMES: Readonly<Record<string, string>> = {
  sign: 'oak_sign', // 1.14
  wall_sign: 'oak_wall_sign', // 1.14
  grass_path: 'dirt_path', // 1.17
  grass: 'short_grass', // 1.20.3
  chain: 'iron_chain', // 1.21.9
}

const WALL_SIDES = ['north', 'east', 'south', 'west']

/** 1.16: the jigsaw `facing` became `orientation` (direction + top). */
const JIGSAW_ORIENTATION: Readonly<Record<string, string>> = {
  down: 'down_south',
  up: 'up_north',
  north: 'north_up',
  south: 'south_up',
  west: 'west_up',
  east: 'east_up',
}

/**
 * Current form of `state`. `dataVersion` is the file's (`null` when it does
 * not say). Returns the same object when nothing changes.
 */
export function upgradeBlockState(state: BlockState, dataVersion: number | null): BlockState {
  if (!state.name.startsWith(MC)) return state
  let name = state.name.slice(MC.length)
  const props: Record<string, string> = { ...state.properties }
  let changed = false
  const rename = (to: string) => {
    name = to
    changed = true
  }

  if (Object.hasOwn(RENAMES, name)) rename(RENAMES[name])

  if (name === 'stone_slab' && dataVersion !== null && dataVersion <= SMOOTH_STONE_SLAB_RENAME) {
    rename('smooth_stone_slab')
  }

  // 1.16: wall sides went from true/false to none/low/tall.
  if (name.endsWith('_wall')) {
    for (const side of WALL_SIDES) {
      if (props[side] === 'true' || props[side] === 'false') {
        props[side] = props[side] === 'true' ? 'low' : 'none'
        changed = true
      }
    }
  }

  if (name === 'jigsaw' && props.facing !== undefined) {
    props.orientation = JIGSAW_ORIENTATION[props.facing] ?? 'north_up'
    delete props.facing
    changed = true
  }

  // 1.17: a cauldron with water became its own block; the empty one has no level.
  if (name === 'cauldron' && props.level !== undefined) {
    const level = props.level
    delete props.level
    if (level === '1' || level === '2' || level === '3') {
      name = 'water_cauldron'
      props.level = level
    }
    changed = true
  }

  // 1.21.5: `active` became `creaking_heart_state` (an inactive heart shows as uprooted).
  if (name === 'creaking_heart' && props.active !== undefined) {
    props.creaking_heart_state = props.active === 'true' ? 'awake' : 'uprooted'
    delete props.active
    changed = true
  }

  return changed ? createBlockState(MC + name, Object.entries(props)) : state
}
