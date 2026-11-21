import { describe, expect, it } from 'vitest'
import legacy from '../../../src/lib/data/legacyBlocks.json'
import { blockStateKey } from '../../../src/lib/parsers/blockState'
import { createLegacyTable } from '../../../src/lib/parsers/mcedit/legacyBlocks'
import { parseMcEditWith } from '../../../src/lib/parsers/mcedit/McEditParser'
import { readNbt } from '../../../src/lib/parsers/nbt/NbtReader'
import { blockIndex, type Structure } from '../../../src/lib/types/structure'
import { encodeNbt } from '../../helpers/nbt'
import { mceditRoot, type McEditSpec } from '../../helpers/mcedit'

/**
 * Neighbor-dependent states of `.schematic` files. Coordinates: x east,
 * z south. Legacy ids used: 1 stone, 5 planks, 25 note block, 35 wool,
 * 41 gold block, 53 oak stairs, 54 chest, 55 redstone, 64 oak door, 69 lever,
 * 78 snow, 85 oak fence, 86 pumpkin, 101 iron bars, 102 glass pane,
 * 104 pumpkin stem, 106 vine, 107 oak fence gate, 113 nether brick fence,
 * 121 end stone, 131 tripwire hook, 132 tripwire, 139 cobblestone wall,
 * 175 double plant, 199 chorus plant, 200 chorus flower.
 */

const table = createLegacyTable(legacy.blocks)

type Placed = [x: number, y: number, z: number, id: number, meta?: number]

function parse(size: [number, number, number], placed: Placed[], extra: Partial<McEditSpec> = {}) {
  const [w, h, l] = size
  const ids = new Array<number>(w * h * l).fill(0)
  const metas = new Array<number>(w * h * l).fill(0)
  for (const [x, y, z, id, meta = 0] of placed) {
    const i = (y * l + z) * w + x
    ids[i] = id
    metas[i] = meta
  }
  return parseMcEditWith(readNbt(encodeNbt(mceditRoot({ size, ids, metas, ...extra }))).root, table)
}

function props(s: Structure, x: number, y: number, z: number): Record<string, string> {
  return { ...s.palette[s.blocks[blockIndex(s.size, x, y, z)]].properties }
}

function key(s: Structure, x: number, y: number, z: number): string {
  return blockStateKey(s.palette[s.blocks[blockIndex(s.size, x, y, z)]])
}

describe('fences, panes and walls', () => {
  it('connects fences to fences and solid blocks, not across materials', () => {
    const s = parse(
      [3, 1, 2],
      [
        [0, 0, 0, 85],
        [1, 0, 0, 85],
        [2, 0, 0, 113],
        [0, 0, 1, 1],
      ],
    )
    expect(props(s, 0, 0, 0)).toMatchObject({
      east: 'true',
      south: 'true',
      west: 'false',
      north: 'false',
    })
    expect(props(s, 1, 0, 0)).toMatchObject({ west: 'true', east: 'false' })
    expect(props(s, 2, 0, 0)).toMatchObject({ west: 'false' })
  })

  it('connects a fence to a gate only across the gate', () => {
    // Gate facing south (meta 0) opens north–south: fences attach east and west.
    const across = parse(
      [2, 1, 1],
      [
        [0, 0, 0, 85],
        [1, 0, 0, 107, 0],
      ],
    )
    expect(props(across, 0, 0, 0).east).toBe('true')
    // Gate facing east (meta 3): its sides are north and south.
    const along = parse(
      [2, 1, 1],
      [
        [0, 0, 0, 85],
        [1, 0, 0, 107, 3],
      ],
    )
    expect(props(along, 0, 0, 0).east).toBe('false')
  })

  it('does not attach to the connection exceptions (pumpkins…)', () => {
    const s = parse(
      [2, 1, 1],
      [
        [0, 0, 0, 85],
        [1, 0, 0, 86],
      ],
    )
    expect(props(s, 0, 0, 0).east).toBe('false')
  })

  it('connects panes to panes, iron bars and walls', () => {
    const s = parse(
      [4, 1, 1],
      [
        [0, 0, 0, 102],
        [1, 0, 0, 101],
        [2, 0, 0, 102],
        [3, 0, 0, 139],
      ],
    )
    expect(props(s, 0, 0, 0)).toMatchObject({ east: 'true', west: 'false' })
    expect(props(s, 1, 0, 0)).toMatchObject({ east: 'true', west: 'true' })
    expect(props(s, 2, 0, 0)).toMatchObject({ east: 'true', west: 'true' })
  })

  it('gives walls none/low/tall sides and raises the post where the game does', () => {
    // Three walls in a row, stone above the middle one.
    const s = parse(
      [3, 2, 1],
      [
        [0, 0, 0, 139],
        [1, 0, 0, 139],
        [2, 0, 0, 139],
        [1, 1, 0, 1],
      ],
    )
    expect(props(s, 0, 0, 0)).toMatchObject({
      east: 'low',
      west: 'none',
      north: 'none',
      up: 'true',
    })
    expect(props(s, 1, 0, 0)).toMatchObject({ east: 'tall', west: 'tall', up: 'false' })
    expect(props(s, 2, 0, 0)).toMatchObject({ west: 'low', up: 'true' })
  })

  it('keeps the post of a straight wall under a torch', () => {
    const s = parse(
      [3, 2, 1],
      [
        [0, 0, 0, 139],
        [1, 0, 0, 139],
        [2, 0, 0, 139],
        [1, 1, 0, 50, 5],
      ],
    )
    expect(props(s, 1, 0, 0)).toMatchObject({ east: 'low', west: 'low', up: 'true' })
  })

  it('takes the structure edge as air', () => {
    const s = parse([1, 1, 1], [[0, 0, 0, 85]])
    expect(props(s, 0, 0, 0)).toMatchObject({
      north: 'false',
      east: 'false',
      south: 'false',
      west: 'false',
    })
  })

  it('sets in_wall on a gate between walls', () => {
    const s = parse(
      [3, 1, 1],
      [
        [0, 0, 0, 139],
        [1, 0, 0, 107, 0],
        [2, 0, 0, 139],
      ],
    )
    expect(props(s, 1, 0, 0).in_wall).toBe('true')
  })
})

describe('stairs', () => {
  it('is straight alone or in a row', () => {
    const s = parse(
      [2, 1, 1],
      [
        [0, 0, 0, 53, 3],
        [1, 0, 0, 53, 3],
      ],
    )
    expect(props(s, 0, 0, 0).shape).toBe('straight')
    expect(props(s, 1, 0, 0).shape).toBe('straight')
  })

  it('forms outer corners with a perpendicular stair in front', () => {
    // A faces north at (1,0,1); B in front of it, at (1,0,0).
    const right = parse(
      [3, 1, 2],
      [
        [1, 0, 1, 53, 3],
        [1, 0, 0, 53, 0],
      ],
    )
    expect(props(right, 1, 0, 1).shape).toBe('outer_right')
    const left = parse(
      [3, 1, 2],
      [
        [1, 0, 1, 53, 3],
        [1, 0, 0, 53, 1],
      ],
    )
    expect(props(left, 1, 0, 1).shape).toBe('outer_left')
  })

  it('forms inner corners with a perpendicular stair behind', () => {
    const right = parse(
      [3, 1, 2],
      [
        [1, 0, 0, 53, 3],
        [1, 0, 1, 53, 0],
      ],
    )
    expect(props(right, 1, 0, 0).shape).toBe('inner_right')
    const left = parse(
      [3, 1, 2],
      [
        [1, 0, 0, 53, 3],
        [1, 0, 1, 53, 1],
      ],
    )
    expect(props(left, 1, 0, 0).shape).toBe('inner_left')
  })

  it('ignores stairs of the other half', () => {
    const s = parse(
      [3, 1, 2],
      [
        [1, 0, 1, 53, 3],
        [1, 0, 0, 53, 4],
      ],
    )
    expect(props(s, 1, 0, 1).shape).toBe('straight')
  })
})

describe('two-block blocks', () => {
  it('completes each door half with the other half', () => {
    // Lower: north, open (meta 3 | 4). Upper: left hinge, powered (8 | 2).
    const s = parse(
      [1, 2, 1],
      [
        [0, 0, 0, 64, 7],
        [0, 1, 0, 64, 10],
      ],
    )
    expect(props(s, 0, 0, 0)).toMatchObject({
      facing: 'north',
      open: 'true',
      hinge: 'left',
      powered: 'true',
    })
    expect(props(s, 0, 1, 0)).toMatchObject({
      facing: 'north',
      open: 'true',
      hinge: 'left',
      powered: 'true',
    })
  })

  it('names the upper half of a double plant after the lower half', () => {
    const s = parse(
      [1, 2, 1],
      [
        [0, 0, 0, 175, 4],
        [0, 1, 0, 175, 8],
      ],
    )
    expect(key(s, 0, 1, 0)).toBe('minecraft:rose_bush[half=upper]')
    // The table default for the upper half (sunflower) is gone from the palette.
    expect(s.palette.some((p) => p.name === 'minecraft:sunflower')).toBe(false)
  })

  it('pairs chests side by side with the same facing', () => {
    const s = parse(
      [3, 1, 1],
      [
        [0, 0, 0, 54, 2],
        [1, 0, 0, 54, 2],
        [2, 0, 0, 54, 2],
      ],
    )
    expect(props(s, 0, 0, 0).type).toBe('left')
    expect(props(s, 1, 0, 0).type).toBe('right')
    expect(props(s, 2, 0, 0).type).toBe('single')
  })

  it('does not pair chests with different facings', () => {
    const s = parse(
      [2, 1, 1],
      [
        [0, 0, 0, 54, 2],
        [1, 0, 0, 54, 3],
      ],
    )
    expect(props(s, 0, 0, 0).type).toBe('single')
  })
})

describe('redstone and tripwire', () => {
  it('connects dust in a T', () => {
    const s = parse(
      [3, 1, 2],
      [
        [1, 0, 1, 55],
        [0, 0, 1, 55],
        [2, 0, 1, 55],
        [1, 0, 0, 55],
      ],
    )
    expect(props(s, 1, 0, 1)).toMatchObject({
      north: 'side',
      east: 'side',
      west: 'side',
      south: 'none',
    })
  })

  it('extends a wire connected on one side across, and keeps a lone wire as a dot', () => {
    const s = parse(
      [3, 1, 3],
      [
        [0, 0, 0, 55],
        [1, 0, 0, 69, 5],
        [0, 0, 2, 55],
      ],
    )
    expect(props(s, 0, 0, 0)).toMatchObject({
      east: 'side',
      west: 'side',
      north: 'none',
      south: 'none',
    })
    expect(props(s, 0, 0, 2)).toMatchObject({
      east: 'none',
      west: 'none',
      north: 'none',
      south: 'none',
    })
  })

  it('climbs a solid block', () => {
    const s = parse(
      [2, 2, 1],
      [
        [0, 0, 0, 55],
        [1, 0, 0, 1],
        [1, 1, 0, 55],
      ],
    )
    expect(props(s, 0, 0, 0).east).toBe('up')
    expect(props(s, 1, 1, 0).west).toBe('side')
  })

  it('connects to a repeater only along its axis', () => {
    // Repeater facing west (meta 1): east–west axis.
    const along = parse(
      [2, 1, 1],
      [
        [0, 0, 0, 55],
        [1, 0, 0, 93, 1],
      ],
    )
    expect(props(along, 0, 0, 0).east).toBe('side')
    const across = parse(
      [2, 1, 1],
      [
        [0, 0, 0, 55],
        [1, 0, 0, 93, 0],
      ],
    )
    expect(props(across, 0, 0, 0).east).toBe('none')
  })

  it('connects tripwire to wire and to hooks facing it', () => {
    const s = parse(
      [4, 1, 1],
      [
        [0, 0, 0, 131, 3],
        [1, 0, 0, 132],
        [2, 0, 0, 132],
        [3, 0, 0, 131, 1],
      ],
    )
    expect(props(s, 1, 0, 0)).toMatchObject({ west: 'true', east: 'true', north: 'false' })
    expect(props(s, 2, 0, 0)).toMatchObject({ west: 'true', east: 'true' })
  })
})

describe('plants and ground', () => {
  it('sets vine up under a solid block', () => {
    const s = parse(
      [1, 2, 1],
      [
        [0, 0, 0, 106, 1],
        [0, 1, 0, 1],
      ],
    )
    expect(props(s, 0, 0, 0).up).toBe('true')
  })

  it('connects chorus plants to chorus and to end stone below', () => {
    const s = parse(
      [1, 3, 1],
      [
        [0, 0, 0, 121],
        [0, 1, 0, 199],
        [0, 2, 0, 200],
      ],
    )
    expect(props(s, 0, 1, 0)).toMatchObject({ down: 'true', up: 'true', north: 'false' })
  })

  it('attaches a grown stem to its fruit', () => {
    const s = parse(
      [2, 1, 1],
      [
        [0, 0, 0, 104, 7],
        [1, 0, 0, 86],
      ],
    )
    expect(key(s, 0, 0, 0)).toBe('minecraft:attached_pumpkin_stem[facing=east]')
    const young = parse(
      [2, 1, 1],
      [
        [0, 0, 0, 104, 3],
        [1, 0, 0, 86],
      ],
    )
    expect(key(young, 0, 0, 0)).toBe('minecraft:pumpkin_stem[age=3]')
  })

  it('makes grass snowy under snow', () => {
    const s = parse(
      [2, 2, 1],
      [
        [0, 0, 0, 2],
        [0, 1, 0, 78],
        [1, 0, 0, 2],
      ],
    )
    expect(props(s, 0, 0, 0).snowy).toBe('true')
    expect(props(s, 1, 0, 0).snowy).toBe('false')
  })
})

describe('note blocks', () => {
  it('takes the instrument from the block below', () => {
    const s = parse(
      [4, 2, 1],
      [
        [0, 0, 0, 41],
        [1, 0, 0, 5],
        [2, 0, 0, 35],
        [3, 0, 0, 1],
        [0, 1, 0, 25],
        [1, 1, 0, 25],
        [2, 1, 0, 25],
        [3, 1, 0, 25],
      ],
    )
    expect(props(s, 0, 1, 0)).toEqual({ instrument: 'bell', note: '0', powered: 'false' })
    expect(props(s, 1, 1, 0).instrument).toBe('bass')
    expect(props(s, 2, 1, 0).instrument).toBe('guitar')
    expect(props(s, 3, 1, 0).instrument).toBe('basedrum')
  })

  it('defaults to harp on air', () => {
    const s = parse([1, 1, 1], [[0, 0, 0, 25]])
    expect(props(s, 0, 0, 0).instrument).toBe('harp')
  })
})
