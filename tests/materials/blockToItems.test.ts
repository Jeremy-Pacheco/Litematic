import { describe, expect, it } from 'vitest'
import { parseBlockStateString } from '../../src/lib/parsers/blockStateString'
import { blockToItems } from '../../src/lib/materials/blockToItems'

/** `blockToItems` from block state text, as `item×count` strings. */
function items(text: string): string[] {
  const state = parseBlockStateString(text)
  if (!state) throw new Error(`Bad test state ${text}`)
  return blockToItems(state).map(
    ({ item, count, category }) =>
      `${item.replace('minecraft:', '')}×${count}${category === 'item' ? '' : ` (${category})`}`,
  )
}

describe('blockToItems', () => {
  it('maps ordinary blocks to the item of the same id', () => {
    expect(items('minecraft:stone')).toEqual(['stone×1'])
    expect(items('minecraft:oak_stairs[facing=north,half=top]')).toEqual(['oak_stairs×1'])
    expect(items('minecraft:cobblestone_wall[up=true]')).toEqual(['cobblestone_wall×1'])
  })

  it('ignores air and technical blocks', () => {
    expect(items('minecraft:air')).toEqual([])
    expect(items('minecraft:cave_air')).toEqual([])
    expect(items('minecraft:piston_head[facing=up]')).toEqual([])
    expect(items('minecraft:moving_piston')).toEqual([])
  })

  it('maps wall variants to their item', () => {
    expect(items('minecraft:wall_torch[facing=east]')).toEqual(['torch×1'])
    expect(items('minecraft:soul_wall_torch')).toEqual(['soul_torch×1'])
    expect(items('minecraft:redstone_wall_torch[lit=true]')).toEqual(['redstone_torch×1'])
    expect(items('minecraft:oak_wall_sign')).toEqual(['oak_sign×1'])
    expect(items('minecraft:spruce_wall_hanging_sign')).toEqual(['spruce_hanging_sign×1'])
    expect(items('minecraft:red_wall_banner')).toEqual(['red_banner×1'])
    expect(items('minecraft:skeleton_wall_skull')).toEqual(['skeleton_skull×1'])
    expect(items('minecraft:player_wall_head')).toEqual(['player_head×1'])
    expect(items('minecraft:dead_tube_coral_wall_fan')).toEqual(['dead_tube_coral_fan×1'])
  })

  it('counts two-block-tall blocks and beds once', () => {
    expect(items('minecraft:oak_door[half=lower]')).toEqual(['oak_door×1'])
    expect(items('minecraft:oak_door[half=upper]')).toEqual([])
    expect(items('minecraft:sunflower[half=upper]')).toEqual([])
    expect(items('minecraft:tall_grass[half=lower]')).toEqual(['tall_grass×1'])
    expect(items('minecraft:red_bed[part=foot]')).toEqual(['red_bed×1'])
    expect(items('minecraft:red_bed[part=head]')).toEqual([])
  })

  it('does not confuse half=top/bottom (stairs, trapdoors, slabs) with two-block-tall', () => {
    expect(items('minecraft:oak_trapdoor[half=top]')).toEqual(['oak_trapdoor×1'])
    expect(items('minecraft:stone_slab[type=top]')).toEqual(['stone_slab×1'])
  })

  it('reads amounts stored in the state', () => {
    expect(items('minecraft:stone_slab[type=double]')).toEqual(['stone_slab×2'])
    expect(items('minecraft:white_candle[candles=3,lit=false]')).toEqual(['white_candle×3'])
    expect(items('minecraft:candle[candles=4]')).toEqual(['candle×4'])
    expect(items('minecraft:sea_pickle[pickles=2]')).toEqual(['sea_pickle×2'])
    expect(items('minecraft:turtle_egg[eggs=4]')).toEqual(['turtle_egg×4'])
    expect(items('minecraft:snow[layers=5]')).toEqual(['snow×5'])
    expect(items('minecraft:pink_petals[flower_amount=3]')).toEqual(['pink_petals×3'])
    expect(items('minecraft:sea_pickle[pickles=bad]')).toEqual(['sea_pickle×1'])
  })

  it('maps crops and plants to the item that plants them', () => {
    expect(items('minecraft:wheat[age=7]')).toEqual(['wheat_seeds×1'])
    expect(items('minecraft:carrots')).toEqual(['carrot×1'])
    expect(items('minecraft:potatoes')).toEqual(['potato×1'])
    expect(items('minecraft:beetroots')).toEqual(['beetroot_seeds×1'])
    expect(items('minecraft:attached_pumpkin_stem')).toEqual(['pumpkin_seeds×1'])
    expect(items('minecraft:cocoa')).toEqual(['cocoa_beans×1'])
    expect(items('minecraft:cave_vines_plant')).toEqual(['glow_berries×1'])
    expect(items('minecraft:kelp_plant')).toEqual(['kelp×1'])
    expect(items('minecraft:redstone_wire[power=0]')).toEqual(['redstone×1'])
    expect(items('minecraft:tripwire')).toEqual(['string×1'])
    expect(items('minecraft:big_dripleaf_stem')).toEqual(['big_dripleaf×1'])
  })

  it('splits composite blocks', () => {
    expect(items('minecraft:potted_cactus')).toEqual(['flower_pot×1', 'cactus×1'])
    expect(items('minecraft:potted_azalea_bush')).toEqual(['flower_pot×1', 'azalea×1'])
    expect(items('minecraft:candle_cake[lit=false]')).toEqual(['cake×1', 'candle×1'])
    expect(items('minecraft:red_candle_cake')).toEqual(['cake×1', 'red_candle×1'])
  })

  it('maps shaped or filled blocks to their base item', () => {
    expect(items('minecraft:farmland[moisture=7]')).toEqual(['dirt×1'])
    expect(items('minecraft:dirt_path')).toEqual(['dirt×1'])
    expect(items('minecraft:water_cauldron[level=3]')).toEqual(['cauldron×1'])
  })

  it('counts fluid sources as buckets and ignores flowing fluid', () => {
    expect(items('minecraft:water[level=0]')).toEqual(['water_bucket×1 (fluid)'])
    expect(items('minecraft:lava')).toEqual(['lava_bucket×1 (fluid)'])
    expect(items('minecraft:water[level=3]')).toEqual([])
    expect(items('minecraft:bubble_column[drag=true]')).toEqual(['water_bucket×1 (fluid)'])
  })

  it('marks survival-unobtainable blocks', () => {
    for (const id of [
      'bedrock',
      'nether_portal',
      'fire',
      'end_portal_frame',
      'command_block',
      'spawner',
    ]) {
      expect(items(`minecraft:${id}`), id).toEqual([`${id}×1 (unobtainable)`])
    }
  })

  it('keeps blocks of other namespaces as they are', () => {
    expect(items('create:cogwheel[axis=y]')).toEqual(['create:cogwheel×1'])
  })
})
