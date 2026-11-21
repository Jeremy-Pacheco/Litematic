import { beforeAll, describe, expect, it } from 'vitest'
import { readClientJar } from '../../src/lib/assets/minecraftJar'
import { blockStateKey } from '../../src/lib/parsers/blockState'
import { parseBlockStateString } from '../../src/lib/parsers/blockStateString'
import { upgradeBlockState } from '../../src/lib/parsers/blockStateUpgrade'
import { parseLitematic } from '../../src/lib/parsers/litematic/LitematicParser'
import { readNbt } from '../../src/lib/parsers/nbt/NbtReader'
import { parseSponge } from '../../src/lib/parsers/sponge/SpongeParser'
import { litematicRoot, region } from '../helpers/litematic'
import { encodeNbt } from '../helpers/nbt'
import { spongeRoot } from '../helpers/sponge'

/** 1.13.2, 1.16.5 and 1.21.4 data versions. */
const V1_13 = 1631
const V1_16 = 2586
const V1_21_4 = 4189

const upgrade = (text: string, dataVersion: number | null = V1_13) =>
  blockStateKey(upgradeBlockState(parseBlockStateString(text)!, dataVersion))

describe('upgradeBlockState', () => {
  it('renames ids that no longer exist', () => {
    expect(upgrade('minecraft:sign[rotation=4]')).toBe('minecraft:oak_sign[rotation=4]')
    expect(upgrade('minecraft:wall_sign[facing=east]')).toBe('minecraft:oak_wall_sign[facing=east]')
    expect(upgrade('minecraft:grass_path')).toBe('minecraft:dirt_path')
    expect(upgrade('minecraft:grass')).toBe('minecraft:short_grass')
    expect(upgrade('minecraft:chain[axis=y,waterlogged=false]', V1_21_4)).toBe(
      'minecraft:iron_chain[axis=y,waterlogged=false]',
    )
  })

  it('renames stone_slab only in 1.13 files, where it was the smooth stone slab', () => {
    expect(upgrade('minecraft:stone_slab[type=top]', V1_13)).toBe(
      'minecraft:smooth_stone_slab[type=top]',
    )
    expect(upgrade('minecraft:stone_slab[type=top]', V1_16)).toBe('minecraft:stone_slab[type=top]')
    // Unknown version (Sponge v1): left as it is.
    expect(upgrade('minecraft:stone_slab[type=top]', null)).toBe('minecraft:stone_slab[type=top]')
  })

  it('turns true/false wall sides into low/none', () => {
    expect(
      upgrade('minecraft:cobblestone_wall[east=true,north=false,south=true,up=true,west=false]'),
    ).toBe('minecraft:cobblestone_wall[east=low,north=none,south=low,up=true,west=none]')
  })

  it('splits water cauldrons from empty ones', () => {
    expect(upgrade('minecraft:cauldron[level=0]')).toBe('minecraft:cauldron')
    expect(upgrade('minecraft:cauldron[level=2]')).toBe('minecraft:water_cauldron[level=2]')
  })

  it('converts the jigsaw facing and the creaking heart activity', () => {
    expect(upgrade('minecraft:jigsaw[facing=up]')).toBe('minecraft:jigsaw[orientation=up_north]')
    expect(upgrade('minecraft:creaking_heart[active=true,axis=y,natural=true]', V1_21_4)).toBe(
      'minecraft:creaking_heart[axis=y,creaking_heart_state=awake,natural=true]',
    )
    expect(upgrade('minecraft:creaking_heart[active=false,axis=x,natural=false]', V1_21_4)).toBe(
      'minecraft:creaking_heart[axis=x,creaking_heart_state=uprooted,natural=false]',
    )
  })

  it('leaves current states untouched (the same object)', () => {
    for (const text of [
      'minecraft:oak_sign[rotation=0]',
      'minecraft:cobblestone_wall[east=tall,north=none,south=low,up=false,west=none]',
      'minecraft:water_cauldron[level=1]',
      'minecraft:grass_block[snowy=false]',
      'minecraft:stone_slab[type=bottom]',
      'mymod:grass',
    ]) {
      const state = parseBlockStateString(text)!
      expect(upgradeBlockState(state, 4325), text).toBe(state)
    }
  })
})

describe('parsers apply the upgrade', () => {
  it('in a 1.13 .litematic', () => {
    const root = litematicRoot(
      {
        r: region({
          position: [0, 0, 0],
          size: [3, 1, 1],
          palette: [
            'minecraft:air',
            [
              'minecraft:cobblestone_wall',
              { east: 'true', north: 'false', south: 'false', west: 'false', up: 'true' },
            ],
            ['minecraft:stone_slab', { type: 'bottom' }],
            'minecraft:grass',
          ],
          blocks: [1, 2, 3],
        }),
      },
      { version: 5, dataVersion: V1_13 },
    )
    const s = parseLitematic(readNbt(encodeNbt(root)).root)
    expect(s.palette.map(blockStateKey).slice(1)).toEqual([
      'minecraft:cobblestone_wall[east=low,north=none,south=none,up=true,west=none]',
      'minecraft:smooth_stone_slab[type=bottom]',
      'minecraft:short_grass',
    ])
  })

  it('in a 1.16 .schem (stone_slab stays)', () => {
    const s = parseSponge(
      readNbt(
        encodeNbt(
          spongeRoot({
            version: 2,
            size: [2, 1, 1],
            palette: { 'minecraft:stone_slab[type=bottom]': 0, 'minecraft:grass_path': 1 },
            blocks: [0, 1],
            dataVersion: V1_16,
          }),
        ),
      ).root,
    )
    expect(s.palette.map(blockStateKey).slice(1)).toEqual([
      'minecraft:stone_slab[type=bottom]',
      'minecraft:dirt_path',
    ])
  })

  it('not in pre-1.13 files, whose names mean other blocks', () => {
    const s = parseSponge(
      readNbt(
        encodeNbt(
          spongeRoot({
            version: 2,
            size: [1, 1, 1],
            palette: { 'minecraft:grass': 0 },
            blocks: [0],
            dataVersion: 1343,
          }),
        ),
      ).root,
    )
    expect(s.warnings.legacyBlockNames).toBe(true)
    expect(s.palette[1].name).toBe('minecraft:grass')
  })
})

interface NodeFs {
  existsSync(path: string): boolean
  readFileSync(path: string): Uint8Array
}
const { getBuiltinModule } = (
  globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }
).process
const fs = getBuiltinModule('node:fs') as NodeFs
const JAR = 'tests/fixtures/local/client-26.3.jar'

describe.skipIf(!fs.existsSync(JAR))('upgraded states against the real client.jar 26.3', () => {
  // Read in beforeAll: a skipped suite still runs its body to collect tests.
  let blockstates!: Map<string, string>
  beforeAll(() => {
    const { files } = readClientJar(new Uint8Array(fs.readFileSync(JAR)))
    blockstates = new Map()
    for (const [path, data] of files) {
      const match = /^assets\/minecraft\/blockstates\/(.+)\.json$/.exec(path)
      if (match) blockstates.set(`minecraft:${match[1]}`, new TextDecoder().decode(data))
    }
  })

  it('every rule produces a block, properties and values the game knows', () => {
    for (const text of [
      'minecraft:sign[rotation=4]',
      'minecraft:wall_sign[facing=east]',
      'minecraft:grass_path',
      'minecraft:grass',
      'minecraft:chain[axis=y]',
      'minecraft:stone_slab[type=top]',
      'minecraft:cobblestone_wall[east=true,north=false,south=true,up=true,west=false]',
      'minecraft:cauldron[level=2]',
      'minecraft:jigsaw[facing=up]',
      'minecraft:creaking_heart[active=true,axis=y]',
    ]) {
      const state = upgradeBlockState(parseBlockStateString(text)!, V1_13)
      const json = blockstates.get(state.name)
      expect(json, `${text} → ${state.name}`).toBeDefined()
      // Each property value is used by some variant key or multipart
      // condition. "none"/"false" only need the property to be known: a
      // multipart model draws nothing for them, so they are never listed.
      for (const [key, value] of Object.entries(state.properties)) {
        const used =
          new RegExp(`(^|[",{])${key}=${value}([",]|$)`).test(json!) ||
          new RegExp(`"${key}":\\s*"[^"]*\\b${value}\\b`).test(json!) ||
          ((value === 'none' || value === 'false') && json!.includes(`"${key}"`))
        expect(used, `${blockStateKey(state)}: ${key}=${value}`).toBe(true)
      }
    }
  })
})
