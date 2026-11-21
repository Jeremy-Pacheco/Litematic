import type { BlockState, Vec3 } from '../../types/structure'
import { createBlockState } from '../blockState'
import type { PaletteBuilder, ParseProgressCallback } from '../structureBuilder'

/**
 * Before 1.13 Minecraft did not save the states that it derives from the
 * neighbors of a block (fence connections, stair shapes, the upper half of a
 * door…): it computed them while drawing. The legacy table can only give a
 * default for those, so this pass computes them from the structure, with the
 * rules of the game's `updateShape` (as in 1.16+, the version of the models
 * the viewer uses, e.g. walls with `none`/`low`/`tall` sides).
 *
 * What lies outside the structure is unknown and taken as air, as WorldEdit
 * does.
 *
 * Cost: one pass over the block array reading a byte table per position;
 * only blocks that need a rule look at their neighbors. Each distinct result
 * is added to the palette once (cached by state and rule output).
 */

const MC = 'minecraft:'

/** Horizontal directions: north (−z), east (+x), south (+z), west (−x). */
const HORIZONTAL = ['north', 'east', 'south', 'west'] as const
const DX = [0, 1, 0, -1]
const DZ = [-1, 0, 1, 0]
const cw = (d: number) => (d + 1) & 3
const ccw = (d: number) => (d + 3) & 3
const opposite = (d: number) => (d + 2) & 3
const sameAxis = (a: number, b: number) => (a & 1) === (b & 1)

const Kind = {
  None: 0,
  Fence: 1,
  Pane: 2,
  Wall: 3,
  FenceGate: 4,
  Stairs: 5,
  Door: 6,
  DoublePlant: 7,
  Redstone: 8,
  Tripwire: 9,
  Vine: 10,
  Chorus: 11,
  Stem: 12,
  Snowy: 13,
  Chest: 14,
  NoteBlock: 15,
  /** Needs its block entity (skulls, banners); counted when it has none. */
  NeedsData: 16,
} as const
type Kind = (typeof Kind)[keyof typeof Kind]

const DOUBLE_PLANTS = ['sunflower', 'lilac', 'tall_grass', 'large_fern', 'rose_bush', 'peony']
const NEEDS_DATA = new Set([
  'skeleton_skull',
  'skeleton_wall_skull',
  'white_banner',
  'white_wall_banner',
])

/** Blocks whose sides are not full, so fences, panes and walls do not attach to them. */
const NOT_SOLID_PATTERN =
  /(_slab|_stairs|_fence|_fence_gate|_wall|_pane|_door|_trapdoor|_carpet|_pressure_plate|_button|_sapling|_bed|_banner|_skull|_head|_rail|_tulip|_stem|_shulker_box|_leaves|_mushroom|torch)$|^potted_|^rail$/
const NOT_SOLID = new Set([
  'air',
  'water',
  'lava',
  'iron_bars',
  'glass_pane',
  'ladder',
  'lever',
  'vine',
  'cobweb',
  'snow',
  'cake',
  'cactus',
  'sugar_cane',
  'lily_pad',
  'fire',
  'nether_portal',
  'end_portal',
  'end_gateway',
  'end_rod',
  'chorus_plant',
  'chorus_flower',
  'flower_pot',
  'brewing_stand',
  'cauldron',
  'hopper',
  'anvil',
  'chipped_anvil',
  'damaged_anvil',
  'enchanting_table',
  'end_portal_frame',
  'daylight_detector',
  'repeater',
  'comparator',
  'redstone_wire',
  'tripwire',
  'tripwire_hook',
  'oak_sign',
  'oak_wall_sign',
  'chest',
  'trapped_chest',
  'ender_chest',
  'dragon_egg',
  'piston_head',
  'moving_piston',
  'cocoa',
  'nether_wart',
  'wheat',
  'carrots',
  'potatoes',
  'beetroots',
  'short_grass',
  'fern',
  'dead_bush',
  'tall_grass',
  'large_fern',
  'sunflower',
  'lilac',
  'rose_bush',
  'peony',
  'dandelion',
  'poppy',
  'blue_orchid',
  'allium',
  'azure_bluet',
  'oxeye_daisy',
  'farmland',
  'dirt_path',
  'soul_sand',
  'structure_void',
])
/** Full blocks that fences, panes and walls still do not attach to. */
const CONNECTION_EXCEPTIONS = new Set([
  'barrier',
  'pumpkin',
  'carved_pumpkin',
  'jack_o_lantern',
  'melon',
])
/** Full blocks that do not conduct redstone (transparent or special). */
const NOT_CONDUCTOR =
  /(^|_)glass$|^(ice|frosted_ice|glowstone|sea_lantern|beacon|slime_block|redstone_block|observer|piston|sticky_piston|barrier)$/
/** Blocks that give a redstone signal from any side (redstone dust connects to them). */
const SIGNAL_SOURCES =
  /^(lever|redstone_torch|redstone_wall_torch|redstone_block|daylight_detector|tripwire_hook|detector_rail|trapped_chest|comparator)$|(_button|_pressure_plate)$/
/** Blocks that raise the post of a wall below them (tag `wall_post_override`). */
const WALL_POST_OVERRIDE = /^(torch|redstone_torch)$|(_sign|_banner|_pressure_plate)$/

const INSTRUMENTS = [
  'harp',
  'basedrum',
  'snare',
  'hat',
  'bass',
  'flute',
  'bell',
  'guitar',
  'chime',
  'xylophone',
] as const
const WOOD = /^(oak|spruce|birch|jungle|acacia|dark_oak)_/
const STONE =
  /(stone|cobblestone|_ore|bricks|sandstone|netherrack|obsidian|bedrock|quartz|terracotta|concrete|prismarine|purpur|andesite|diorite|granite|magma_block|furnace|dispenser|dropper|observer|spawner|coal_block|end_portal_frame|enchanting_table)/

/** What the rules need to know about a palette state. */
interface Info {
  /** Path of a `minecraft:` id (`oak_fence`); empty for other namespaces. */
  name: string
  props: Readonly<Record<string, string>>
  kind: Kind
  /** Full, sturdy sides. */
  solid: boolean
  /** Conducts redstone (solid and opaque). */
  conductor: boolean
  /** Fences, panes and walls attach to it (solid, not an exception). */
  attachable: boolean
  /** Gives a redstone signal from any side. */
  signal: boolean
  /** Note block instrument when this block is below one (index into `INSTRUMENTS`). */
  instrument: number
  /** Raises the post of a wall below it (torches, signs, banners…). */
  raisesWallPost: boolean
  /** Horizontal `facing` (index into `HORIZONTAL`), or −1. */
  facing: number
}

function describe(state: BlockState): Info {
  const name = state.name.startsWith(MC) ? state.name.slice(MC.length) : ''
  const props = state.properties
  const solid =
    name !== '' &&
    (props.type === 'double' || (!NOT_SOLID.has(name) && !NOT_SOLID_PATTERN.test(name)))
  return {
    name,
    props,
    kind: kindOf(name, props),
    solid,
    conductor: solid && !NOT_CONDUCTOR.test(name),
    attachable: solid && !CONNECTION_EXCEPTIONS.has(name),
    signal: SIGNAL_SOURCES.test(name),
    instrument: instrumentOf(name),
    raisesWallPost: WALL_POST_OVERRIDE.test(name),
    facing: HORIZONTAL.indexOf(props.facing as (typeof HORIZONTAL)[number]),
  }
}

function kindOf(name: string, props: Readonly<Record<string, string>>): Kind {
  if (name.endsWith('_fence_gate')) return Kind.FenceGate
  if (name.endsWith('_fence')) return Kind.Fence
  if (name === 'iron_bars' || name.endsWith('glass_pane')) return Kind.Pane
  if (name.endsWith('_wall')) return Kind.Wall
  if (name.endsWith('_stairs')) return Kind.Stairs
  if (name.endsWith('_door')) return Kind.Door
  if (DOUBLE_PLANTS.includes(name) && props.half === 'upper') return Kind.DoublePlant
  if (NEEDS_DATA.has(name)) return Kind.NeedsData
  switch (name) {
    case 'redstone_wire':
      return Kind.Redstone
    case 'tripwire':
      return Kind.Tripwire
    case 'vine':
      return Kind.Vine
    case 'chorus_plant':
      return Kind.Chorus
    case 'pumpkin_stem':
    case 'melon_stem':
      return props.age === '7' ? Kind.Stem : Kind.None
    case 'grass_block':
    case 'podzol':
    case 'mycelium':
      return Kind.Snowy
    case 'chest':
    case 'trapped_chest':
      return Kind.Chest
    case 'note_block':
      return Kind.NoteBlock
    default:
      return Kind.None
  }
}

/** Read access to the structure while it is being fixed. */
class Neighborhood {
  readonly #infos: Info[]
  readonly #air: Info
  // Size as plain fields: read for every neighbor.
  readonly #sx: number
  readonly #sy: number
  readonly #sz: number

  constructor(
    readonly blocks: Uint16Array,
    readonly size: Vec3,
    readonly palette: PaletteBuilder,
  ) {
    this.#infos = palette.states.map(describe)
    this.#air = this.#infos[0]
    this.#sx = size.x
    this.#sy = size.y
    this.#sz = size.z
  }

  info(index: number): Info {
    let info = this.#infos[index]
    if (info === undefined) {
      // A state added by the pass itself.
      for (let i = this.#infos.length; i <= index; i++) {
        this.#infos.push(describe(this.palette.states[i]))
      }
      info = this.#infos[index]
    }
    return info
  }

  /** Palette index at a position; air outside the structure. */
  indexAt(x: number, y: number, z: number): number {
    if (x < 0 || y < 0 || z < 0 || x >= this.#sx || y >= this.#sy || z >= this.#sz) return 0
    return this.blocks[(y * this.#sz + z) * this.#sx + x]
  }

  at(x: number, y: number, z: number): Info {
    const index = this.indexAt(x, y, z)
    return index === 0 ? this.#air : this.info(index)
  }

  /** Neighbor in horizontal direction `d`. */
  side(x: number, y: number, z: number, d: number): Info {
    return this.at(x + DX[d], y, z + DZ[d])
  }
}

/**
 * A rule computes a small integer from the neighbors (−1: leave the block as
 * it is) and builds the new state from it. Equal codes give equal states, so
 * results are cached per (state, code).
 */
interface Rule {
  /** Must return a value below `CODE_RANGE`. */
  code(n: Neighborhood, x: number, y: number, z: number, self: Info): number
  build(self: Info, code: number): BlockState
}

function state(self: Info, props: Record<string, string>, name = self.name): BlockState {
  return createBlockState(MC + name, Object.entries({ ...self.props, ...props }))
}

/** Sets `north`/`east`/`south`/`west` from a 4-bit mask. */
function sidesFromMask(self: Info, mask: number): BlockState {
  const props: Record<string, string> = {}
  HORIZONTAL.forEach((dir, d) => (props[dir] = String((mask & (1 << d)) !== 0)))
  return state(self, props)
}

/** A fence gate attaches to fences and walls on the sides of its hinge axis. */
function gateAttaches(gate: Info, d: number): boolean {
  return gate.kind === Kind.FenceGate && gate.facing >= 0 && !sameAxis(gate.facing, d)
}

const isNetherFence = (info: Info) => info.name === 'nether_brick_fence'

const fence: Rule = {
  code(n, x, y, z, self) {
    let mask = 0
    for (let d = 0; d < 4; d++) {
      const other = n.side(x, y, z, d)
      const connects =
        other.kind === Kind.Fence
          ? isNetherFence(other) === isNetherFence(self)
          : other.attachable || gateAttaches(other, d)
      if (connects) mask |= 1 << d
    }
    return mask
  },
  build: sidesFromMask,
}

const pane: Rule = {
  code(n, x, y, z) {
    let mask = 0
    for (let d = 0; d < 4; d++) {
      const other = n.side(x, y, z, d)
      if (other.kind === Kind.Pane || other.kind === Kind.Wall || other.attachable) mask |= 1 << d
    }
    return mask
  },
  build: sidesFromMask,
}

/** Wall sides: 0 none, 1 low, 2 tall. Code: sides in base 3, plus 81 when the post is raised. */
const WALL_SIDES = ['none', 'low', 'tall'] as const

const wall: Rule = {
  code(n, x, y, z) {
    const above = n.at(x, y + 1, z)
    const north = wallSide(n.side(x, y, z, 0), 0, above)
    const east = wallSide(n.side(x, y, z, 1), 1, above)
    const south = wallSide(n.side(x, y, z, 2), 2, above)
    const west = wallSide(n.side(x, y, z, 3), 3, above)
    const up = raisesPost(above, north, east, south, west)
    return north + 3 * east + 9 * south + 27 * west + (up ? 81 : 0)
  },
  build(self, code) {
    const props: Record<string, string> = { up: String(code >= 81) }
    let rest = code % 81
    for (const dir of HORIZONTAL) {
      props[dir] = WALL_SIDES[rest % 3]
      rest = Math.floor(rest / 3)
    }
    return state(self, props)
  },
}

/** Side `d` of a wall next to `other`, under `above`: 0 none, 1 low, 2 tall. */
function wallSide(other: Info, d: number, above: Info): number {
  const connected =
    other.kind === Kind.Wall ||
    other.kind === Kind.Pane ||
    other.attachable ||
    gateAttaches(other, d)
  if (!connected) return 0
  // Tall when the block above covers that side: a full block, or a wall that
  // also extends that way.
  const covered =
    above.solid || (above.kind === Kind.Wall && (above.props[HORIZONTAL[d]] ?? 'none') !== 'none')
  return covered ? 2 : 1
}

/** `WallBlock.shouldRaisePost` (1.16+). */
function raisesPost(
  above: Info,
  north: number,
  east: number,
  south: number,
  west: number,
): boolean {
  if (above.kind === Kind.Wall && above.props.up === 'true') return true
  const allNone = north === 0 && east === 0 && south === 0 && west === 0
  if (allNone || (north === 0) !== (south === 0) || (east === 0) !== (west === 0)) return true
  if ((north === 2 && south === 2) || (east === 2 && west === 2)) return false
  return above.raisesWallPost || above.solid
}

const fenceGate: Rule = {
  code(n, x, y, z, self) {
    if (self.facing < 0) return -1
    const left = n.side(x, y, z, ccw(self.facing))
    const right = n.side(x, y, z, cw(self.facing))
    return left.kind === Kind.Wall || right.kind === Kind.Wall ? 1 : 0
  },
  build: (self, code) => state(self, { in_wall: String(code === 1) }),
}

const STAIR_SHAPES = ['straight', 'inner_left', 'inner_right', 'outer_left', 'outer_right'] as const

/** `StairBlock.getStairsShape`. */
const stairs: Rule = {
  code(n, x, y, z, self) {
    const facing = self.facing
    if (facing < 0) return -1
    const front = n.side(x, y, z, facing)
    if (isStairLike(front, self) && front.facing >= 0 && !sameAxis(front.facing, facing)) {
      const side = n.side(x, y, z, opposite(front.facing))
      if (!isStairLike(side, self) || side.facing !== facing) {
        return front.facing === ccw(facing) ? 3 : 4
      }
    }
    const back = n.side(x, y, z, opposite(facing))
    if (isStairLike(back, self) && back.facing >= 0 && !sameAxis(back.facing, facing)) {
      const side = n.side(x, y, z, back.facing)
      if (!isStairLike(side, self) || side.facing !== facing) {
        return back.facing === ccw(facing) ? 1 : 2
      }
    }
    return 0
  },
  build: (self, code) => state(self, { shape: STAIR_SHAPES[code] }),
}

/** Stairs of the same half as `self` (the only ones that change its shape). */
function isStairLike(other: Info, self: Info): boolean {
  return other.kind === Kind.Stairs && other.props.half === self.props.half
}

/**
 * Legacy doors kept facing and open in the lower half and hinge and powered
 * in the upper half; each half takes the missing ones from the other.
 */
const door: Rule = {
  code(n, x, y, z, self) {
    if (self.props.half === 'lower') {
      const upper = n.at(x, y + 1, z)
      if (upper.name !== self.name || upper.props.half !== 'upper') return -1
      return (upper.props.hinge === 'right' ? 1 : 0) | (upper.props.powered === 'true' ? 2 : 0)
    }
    const lower = n.at(x, y - 1, z)
    if (lower.name !== self.name || lower.props.half !== 'lower' || lower.facing < 0) return -1
    return lower.facing * 2 + (lower.props.open === 'true' ? 1 : 0)
  },
  build(self, code) {
    return self.props.half === 'lower'
      ? state(self, { hinge: code & 1 ? 'right' : 'left', powered: String((code & 2) !== 0) })
      : state(self, { facing: HORIZONTAL[code >> 1], open: String((code & 1) !== 0) })
  },
}

/** The upper half of a legacy double plant did not say which plant it was. */
const doublePlant: Rule = {
  code(n, x, y, z, self) {
    const lower = n.at(x, y - 1, z)
    const plant = DOUBLE_PLANTS.indexOf(lower.name)
    if (plant < 0 || lower.props.half !== 'lower' || lower.name === self.name) return -1
    return plant
  },
  build: (self, plant) => state(self, {}, DOUBLE_PLANTS[plant]),
}

const WIRE_SIDES = ['none', 'side', 'up'] as const

/** `RedStoneWireBlock.canConnectTo` for a horizontal neighbor in direction `d`. */
function wireConnects(other: Info, d: number): boolean {
  if (other.kind === Kind.Redstone) return true
  if (other.name === 'repeater') return other.facing >= 0 && sameAxis(other.facing, d)
  if (other.name === 'observer') return other.facing === d
  return other.signal
}

/**
 * `RedStoneWireBlock.getConnectingSide` toward direction `d`: 2 up (climbs
 * the neighbor), 1 side, 0 none. `covered`: the block above the wire
 * conducts, which stops it from climbing.
 */
function wireSide(
  n: Neighborhood,
  x: number,
  y: number,
  z: number,
  d: number,
  covered: boolean,
): number {
  const nx = x + DX[d]
  const nz = z + DZ[d]
  const other = n.at(nx, y, nz)
  if (!covered && other.solid && n.at(nx, y + 1, nz).kind === Kind.Redstone) return 2
  if (wireConnects(other, d)) return 1
  if (!other.conductor && n.at(nx, y - 1, nz).kind === Kind.Redstone) return 1
  return 0
}

/** Redstone dust, with the missing connections of a line added as in 1.16+. */
const redstone: Rule = {
  code(n, x, y, z) {
    const covered = n.at(x, y + 1, z).conductor
    let north = wireSide(n, x, y, z, 0, covered)
    let east = wireSide(n, x, y, z, 1, covered)
    let south = wireSide(n, x, y, z, 2, covered)
    let west = wireSide(n, x, y, z, 3, covered)
    // `getMissingConnections`: a wire connected only along x (nothing north
    // or south) reaches both the east and west ends, and the same along z.
    // An isolated wire stays a dot. Sides already connected (maybe `up`) keep
    // their value.
    const noNorthSouth = north === 0 && south === 0
    const noEastWest = east === 0 && west === 0
    if (noNorthSouth && !noEastWest) {
      if (east === 0) east = 1
      if (west === 0) west = 1
    } else if (noEastWest && !noNorthSouth) {
      if (north === 0) north = 1
      if (south === 0) south = 1
    }
    return north + 3 * east + 9 * south + 27 * west
  },
  build(self, code) {
    const props: Record<string, string> = {}
    let rest = code
    for (const dir of HORIZONTAL) {
      props[dir] = WIRE_SIDES[rest % 3]
      rest = Math.floor(rest / 3)
    }
    return state(self, props)
  },
}

const tripwire: Rule = {
  code(n, x, y, z) {
    let mask = 0
    for (let d = 0; d < 4; d++) {
      const other = n.side(x, y, z, d)
      const hook = other.name === 'tripwire_hook' && other.facing === opposite(d)
      if (other.kind === Kind.Tripwire || hook) mask |= 1 << d
    }
    return mask
  },
  build: sidesFromMask,
}

const vine: Rule = {
  code: (n, x, y, z) => (n.at(x, y + 1, z).solid ? 1 : 0),
  build: (self, code) => state(self, { up: String(code === 1) }),
}

const CHORUS_DIRECTIONS = [...HORIZONTAL, 'up', 'down'] as const
const isChorus = (info: Info) => info.name === 'chorus_plant' || info.name === 'chorus_flower'

const chorus: Rule = {
  code(n, x, y, z) {
    let mask = 0
    for (let d = 0; d < 4; d++) if (isChorus(n.side(x, y, z, d))) mask |= 1 << d
    if (isChorus(n.at(x, y + 1, z))) mask |= 1 << 4
    const below = n.at(x, y - 1, z)
    if (isChorus(below) || below.name === 'end_stone') mask |= 1 << 5
    return mask
  },
  build(self, mask) {
    const props: Record<string, string> = {}
    CHORUS_DIRECTIONS.forEach((dir, i) => (props[dir] = String((mask & (1 << i)) !== 0)))
    return state(self, props)
  },
}

/** A fully grown stem next to its fruit becomes an attached stem facing it. */
const stem: Rule = {
  code(n, x, y, z, self) {
    const pumpkin = self.name === 'pumpkin_stem'
    for (let d = 0; d < 4; d++) {
      const fruit = n.side(x, y, z, d).name
      if (pumpkin ? fruit === 'pumpkin' || fruit === 'carved_pumpkin' : fruit === 'melon') return d
    }
    return -1
  },
  build: (self, d) => createBlockState(`${MC}attached_${self.name}`, [['facing', HORIZONTAL[d]]]),
}

const snowy: Rule = {
  code(n, x, y, z) {
    const above = n.at(x, y + 1, z).name
    return above === 'snow' || above === 'snow_block' ? 1 : 0
  },
  build: (self, code) => state(self, { snowy: String(code === 1) }),
}

/** `NoteBlockInstrument` for the block below (by material in 1.13–1.19). */
function instrumentOf(name: string): number {
  if (name === 'clay') return 5
  if (name === 'gold_block') return 6
  if (name.endsWith('_wool')) return 7
  if (name === 'packed_ice') return 8
  if (name === 'bone_block') return 9
  if (/^(sand|red_sand|gravel)$|_concrete_powder$/.test(name)) return 2
  if (/(^|_)glass(_pane)?$|^(sea_lantern|beacon|glowstone|redstone_lamp)$/.test(name)) return 3
  // Buttons are decorations; redstone dust, torches and the redstone block are not stone.
  if (/^redstone_(?!ore)|_button$/.test(name)) return 0
  if (
    (WOOD.test(name) && !/(_leaves|_sapling)$/.test(name)) ||
    /(planks|bookshelf|crafting_table|chest|note_block|jukebox|sign|mushroom_block|mushroom_stem|daylight_detector|banner)$/.test(
      name,
    )
  ) {
    return 4
  }
  if (name === 'nether_brick_fence' || STONE.test(name)) return 1
  return 0
}

const noteBlock: Rule = {
  code: (n, x, y, z) => n.at(x, y - 1, z).instrument,
  build: (self, code) =>
    state(self, {
      instrument: INSTRUMENTS[code],
      note: self.props.note ?? '0',
      powered: self.props.powered ?? 'false',
    }),
}

/** Rule per kind (index = `Kind`); kinds handled apart have none. */
const RULES: readonly (Rule | null)[] = [
  null, // None
  fence,
  pane,
  wall,
  fenceGate,
  stairs,
  door,
  doublePlant,
  redstone,
  tripwire,
  vine,
  chorus,
  stem,
  snowy,
  null, // Chest: pairChest
  noteBlock,
  null, // NeedsData: only counted
]

const PROGRESS_STEP = 1 << 20

/** Every rule code is below this (walls: 3^4 sides × 2 posts = 162). */
const CODE_RANGE = 162

export interface LegacyNeighborResult {
  /** Skulls and banners without their block entity (shown with the default look). */
  missingBlockEntities: number
}

/**
 * Computes the neighbor-dependent states of a structure converted from
 * numeric ids, rewriting `blocks` in place. `withBlockEntity` holds the
 * positions already resolved from their block entity.
 */
export function applyLegacyNeighbors(
  blocks: Uint16Array,
  size: Vec3,
  palette: PaletteBuilder,
  withBlockEntity: ReadonlySet<number>,
  onProgress?: ParseProgressCallback,
): LegacyNeighborResult {
  const result: LegacyNeighborResult = { missingBlockEntities: 0 }
  const n = new Neighborhood(blocks, size, palette)
  const originalStates = palette.states.length
  // Kind of every possible 16-bit index, so the scan needs no bounds check.
  // States added by this pass are already final: they stay `None`.
  const kinds = new Uint8Array(0x10000)
  for (let i = 0; i < originalStates; i++) kinds[i] = n.info(i).kind
  if (kinds.every((kind) => kind === Kind.None)) return result

  // Result of (original state, code): a flat table, −1 until computed.
  const cache = new Int32Array(originalStates * CODE_RANGE).fill(-1)
  const variant: Variant = (index, code, build) => {
    const slot = index * CODE_RANGE + code
    let next = cache[slot]
    if (next < 0) {
      next = addState(palette, build(n.info(index), code))
      cache[slot] = next
    }
    return next
  }

  const fix = (i: number, x: number, y: number, z: number, index: number, kind: number) => {
    if (kind === Kind.NeedsData) {
      if (!withBlockEntity.has(i)) result.missingBlockEntities++
    } else if (kind === Kind.Chest) {
      pairChest(n, x, y, z, variant)
    } else {
      const rule = RULES[kind]
      const code = rule ? rule.code(n, x, y, z, n.info(index)) : -1
      if (rule && code >= 0) blocks[i] = variant(index, code, rule.build)
    }
  }

  // Top to bottom: a wall looks at the wall above it, already fixed.
  // Progress about every million positions, as the decoding loop does.
  const layersPerReport = Math.max(1, Math.ceil(PROGRESS_STEP / (size.x * size.z)))
  for (let y = size.y - 1; y >= 0; y--) {
    const done = size.y - 1 - y
    if (done % layersPerReport === 0) onProgress?.(done / size.y)
    for (let z = 0; z < size.z; z++) {
      // Kept minimal: most positions need nothing.
      for (let x = 0, i = (y * size.z + z) * size.x; x < size.x; x++, i++) {
        const kind = kinds[blocks[i]]
        if (kind !== Kind.None) fix(i, x, y, z, blocks[i], kind)
      }
    }
  }
  return result
}

/**
 * Legacy chests had no `type`: two equal chests side by side with the same
 * facing form a double chest. `LEFT` is the half whose partner is clockwise
 * of its facing (`ChestBlock.getConnectedDirection`).
 */
function pairChest(n: Neighborhood, x: number, y: number, z: number, variant: Variant): void {
  const { blocks, size } = n
  const i = (y * size.z + z) * size.x + x
  const index = blocks[i]
  const self = n.info(index)
  if (self.facing < 0 || self.props.type !== 'single') return
  // Clockwise first: this one is LEFT (code 0) and the partner RIGHT (1).
  for (let left = 1; left >= 0; left--) {
    const d = left ? cw(self.facing) : ccw(self.facing)
    const px = x + DX[d]
    const pz = z + DZ[d]
    const partnerIndex = n.indexAt(px, y, pz)
    const partner = n.info(partnerIndex)
    if (
      partnerIndex === 0 ||
      partner.name !== self.name ||
      partner.facing !== self.facing ||
      partner.props.type !== 'single'
    ) {
      continue
    }
    blocks[i] = variant(index, 1 - left, chestHalf)
    blocks[(y * size.z + pz) * size.x + px] = variant(partnerIndex, left, chestHalf)
    return
  }
}

/** Code 0: left half, 1: right half. */
const chestHalf = (self: Info, code: number) => state(self, { type: code === 0 ? 'left' : 'right' })

/** Palette index of `build(state at index, code)`, cached per (index, code). */
type Variant = (
  index: number,
  code: number,
  build: (self: Info, code: number) => BlockState,
) => number

/** The block array is 16-bit: legacy palettes stay far below that. */
function addState(palette: PaletteBuilder, blockState: BlockState): number {
  const index = palette.add(blockState)
  if (index > 0xffff) throw new RangeError('Legacy palette exceeds 65 536 states')
  return index
}
