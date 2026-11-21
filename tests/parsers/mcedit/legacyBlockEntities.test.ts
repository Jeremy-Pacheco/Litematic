import { describe, expect, it } from 'vitest'
import legacy from '../../../src/lib/data/legacyBlocks.json'
import { blockStateKey } from '../../../src/lib/parsers/blockState'
import { createLegacyTable } from '../../../src/lib/parsers/mcedit/legacyBlocks'
import { parseMcEditWith } from '../../../src/lib/parsers/mcedit/McEditParser'
import { readNbt } from '../../../src/lib/parsers/nbt/NbtReader'
import { isNbtCompound, isNbtList, NbtType } from '../../../src/lib/types/nbt'
import { blockIndex, type Structure } from '../../../src/lib/types/structure'
import { byte, compound, encodeNbt, int, list, str, type Tag } from '../../helpers/nbt'
import { mceditRoot, type McEditSpec } from '../../helpers/mcedit'

/**
 * Blocks whose look was stored in their block entity before 1.13. Legacy ids:
 * 26 bed, 140 flower pot, 144 skull, 176 standing banner, 177 wall banner,
 * 25 note block.
 */

const table = createLegacyTable(legacy.blocks)

type TileEntities = NonNullable<McEditSpec['tileEntities']>

/** A row of blocks along x, with tile entities. */
function parse(ids: number[], metas: number[], tileEntities: TileEntities): Structure {
  const spec: McEditSpec = { size: [ids.length, 1, 1], ids, metas, tileEntities }
  return parseMcEditWith(readNbt(encodeNbt(mceditRoot(spec))).root, table)
}

const at = (s: Structure, x: number) =>
  blockStateKey(s.palette[s.blocks[blockIndex(s.size, x, 0, 0)]])

describe('beds', () => {
  it('takes the color from the block entity, in both id styles', () => {
    const s = parse(
      [26, 26],
      [3, 11],
      [
        { pos: [0, 0, 0], id: 'minecraft:bed', extra: { color: int(11) } },
        { pos: [1, 0, 0], id: 'Bed', extra: { color: int(11) } },
      ],
    )
    expect(at(s, 0)).toBe('minecraft:blue_bed[facing=east,occupied=false,part=foot]')
    expect(at(s, 1)).toBe('minecraft:blue_bed[facing=east,occupied=false,part=head]')
    expect(s.palette.some((p) => p.name === 'minecraft:red_bed')).toBe(false)
  })

  it('stays red without block entity (beds before 1.12)', () => {
    const s = parse([26], [3], [])
    expect(at(s, 0)).toMatch(/^minecraft:red_bed\[/)
    expect(s.warnings.approximateLegacyStates).toBe(false)
  })
})

describe('banners', () => {
  it('reads the base color as a dye damage value and converts pattern colors', () => {
    // Base 4 is blue dye (15 - 4 = 11, blue). Pattern color 1 is red dye (14).
    const patterns: Tag = list(NbtType.Compound, [compound({ Pattern: str('bs'), Color: int(1) })])
    const s = parse(
      [176, 177],
      [5, 3],
      [
        { pos: [0, 0, 0], id: 'Banner', extra: { Base: int(4), Patterns: patterns } },
        { pos: [1, 0, 0], id: 'minecraft:banner', extra: { Base: int(0) } },
      ],
    )
    expect(at(s, 0)).toBe('minecraft:blue_banner[rotation=5]')
    expect(at(s, 1)).toBe('minecraft:black_wall_banner[facing=south]')

    const stored = s.blockEntities[0].nbt.get('Patterns')
    const layer = isNbtList(stored) ? stored.items[0] : undefined
    expect(isNbtCompound(layer) && layer.get('Color')).toBe(14)
    expect(s.warnings.approximateLegacyStates).toBe(false)
  })

  it('flags banners without block entity', () => {
    const s = parse([176], [0], [])
    expect(at(s, 0)).toBe('minecraft:white_banner[rotation=0]')
    expect(s.warnings.approximateLegacyStates).toBe(true)
  })
})

describe('skulls', () => {
  it('picks the head type and the floor rotation', () => {
    const s = parse(
      [144, 144],
      [1, 2],
      [
        { pos: [0, 0, 0], id: 'Skull', extra: { SkullType: byte(4), Rot: byte(7) } },
        { pos: [1, 0, 0], id: 'minecraft:skull', extra: { SkullType: byte(1), Rot: byte(0) } },
      ],
    )
    expect(at(s, 0)).toBe('minecraft:creeper_head[rotation=7]')
    expect(at(s, 1)).toBe('minecraft:wither_skeleton_wall_skull[facing=north]')
  })

  it('keeps skeleton skulls and does not flag them when the block entity says so', () => {
    const s = parse(
      [144],
      [1],
      [{ pos: [0, 0, 0], id: 'Skull', extra: { SkullType: byte(0), Rot: byte(3) } }],
    )
    expect(at(s, 0)).toBe('minecraft:skeleton_skull[rotation=3]')
    expect(s.warnings.approximateLegacyStates).toBe(false)
  })
})

describe('flower pots', () => {
  it('reads the plant from Item and Data, as a string or a number', () => {
    const s = parse(
      [140, 140, 140, 140],
      [0, 0, 0, 0],
      [
        {
          pos: [0, 0, 0],
          id: 'FlowerPot',
          extra: { Item: str('minecraft:red_flower'), Data: int(2) },
        },
        { pos: [1, 0, 0], id: 'FlowerPot', extra: { Item: int(38), Data: int(0) } },
        {
          pos: [2, 0, 0],
          id: 'minecraft:flower_pot',
          extra: { Item: str('minecraft:sapling'), Data: int(5) },
        },
        { pos: [3, 0, 0], id: 'minecraft:flower_pot', extra: { Item: str(''), Data: int(0) } },
      ],
    )
    expect(at(s, 0)).toBe('minecraft:potted_allium')
    expect(at(s, 1)).toBe('minecraft:potted_poppy')
    expect(at(s, 2)).toBe('minecraft:potted_dark_oak_sapling')
    expect(at(s, 3)).toBe('minecraft:flower_pot')
  })

  it('keeps the plant of pots saved in the metadata (before 1.7)', () => {
    const s = parse([140], [1], [])
    expect(at(s, 0)).toBe('minecraft:potted_poppy')
  })
})

describe('note blocks', () => {
  it('reads the note', () => {
    const s = parse([25], [0], [{ pos: [0, 0, 0], id: 'Music', extra: { note: byte(12) } }])
    expect(at(s, 0)).toBe('minecraft:note_block[instrument=harp,note=12,powered=false]')
  })
})

describe('block entities on other blocks', () => {
  it('are ignored', () => {
    const s = parse([1], [0], [{ pos: [0, 0, 0], id: 'Bed', extra: { color: int(3) } }])
    expect(at(s, 0)).toBe('minecraft:stone')
  })
})
