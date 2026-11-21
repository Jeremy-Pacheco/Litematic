/**
 * Bakes real block models from the official client.jar (git-ignored local
 * fixture; skipped when absent). Uses a fake atlas: geometry and grouping do
 * not depend on the texture images.
 */
import { Identifier } from 'deepslate/core'
import { beforeAll, describe, expect, it } from 'vitest'
import { readClientJar } from '../../src/lib/assets/minecraftJar'
import {
  bakePalette,
  bakeState,
  collectTextureIds,
  FACES,
  INNER_GROUP,
  MISSING_TEXTURE,
  type BakeAtlas,
} from '../../src/lib/models/bakeStates'
import { GameResources } from '../../src/lib/models/gameResources'
import { FLUID_LAVA, FLUID_WATER } from '../../src/lib/models/bakedTypes'
import { RenderLayer } from '../../src/lib/models/renderLayer'
import { parseBlockStateString } from '../../src/lib/parsers/blockStateString'
import { readStructureFile } from '../../src/lib/parsers/readStructureFile'

interface NodeFs {
  existsSync(path: string): boolean
  readFileSync(path: string): Uint8Array
}
const { getBuiltinModule } = (
  globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }
).process
const fs = getBuiltinModule('node:fs') as NodeFs
const JAR = 'tests/fixtures/local/client-26.3.jar'

/** Atlas with one 16×16 cell per texture id; layer chosen from the id. */
function fakeAtlas(): BakeAtlas & { ids: string[] } {
  const ids: string[] = []
  const cell = (id: string) => {
    let i = ids.indexOf(id)
    if (i < 0) i = ids.push(id) - 1
    return i
  }
  const layerOf = (id: string) =>
    /stained_glass|water|ice\b/.test(id)
      ? RenderLayer.Translucent
      : /glass|leaves|door|torch|flower|missing/.test(id)
        ? RenderLayer.Cutout
        : RenderLayer.Opaque
  return {
    ids,
    getTextureAtlas: () => {
      throw new Error('not used')
    },
    getTextureUV(id: Identifier) {
      const i = cell(id.toString())
      return [i / 4096, 0, (i + 1) / 4096, 1 / 256]
    },
    layerAt(u) {
      return layerOf(ids[Math.floor(u * 4096)] ?? '')
    },
  }
}

const state = (text: string) => parseBlockStateString(text)!
const groupQuads = (baked: ReturnType<typeof bakeState>, layer: number, group: number) =>
  baked.geometry[layer][group]?.quadCount ?? 0
const ALL_SIDES = 0b111111

describe.skipIf(!fs.existsSync(JAR))('bakeState with the real game models', () => {
  // Read in beforeAll: a skipped suite still runs its body to collect its
  // tests, and the jar only exists on the author's machine (not in CI).
  let resources!: GameResources
  beforeAll(() => {
    resources = new GameResources(readClientJar(new Uint8Array(fs.readFileSync(JAR))).files)
  })

  it('bakes a full opaque cube: one quad per side, covering and occluding every side', () => {
    const baked = bakeState(state('minecraft:stone'), resources, fakeAtlas())
    for (let side = 0; side < 6; side++)
      expect(groupQuads(baked, RenderLayer.Opaque, side), FACES[side]).toBe(1)
    expect(baked.fullFaces).toBe(ALL_SIDES)
    expect(baked.opaqueFaces).toBe(ALL_SIDES)
    expect(baked.missing).toBe(false)
  })

  it('keeps all positions inside the block', () => {
    const baked = bakeState(
      state('minecraft:oak_stairs[facing=east,half=top,shape=outer_left]'),
      resources,
      fakeAtlas(),
    )
    for (const groups of baked.geometry) {
      for (const g of groups) {
        for (const v of g?.positions ?? []) {
          expect(v).toBeGreaterThanOrEqual(-1e-4)
          expect(v).toBeLessThanOrEqual(1 + 1e-4)
        }
      }
    }
  })

  it('knows which sides a bottom slab covers', () => {
    const baked = bakeState(state('minecraft:stone_slab[type=bottom]'), resources, fakeAtlas())
    expect(baked.opaqueFaces).toBe(1 << FACES.indexOf('down'))
  })

  it('rotates variants: stairs facing north and east cover different sides', () => {
    const north = bakeState(
      state('minecraft:oak_stairs[facing=north,half=bottom,shape=straight]'),
      resources,
      fakeAtlas(),
    )
    const east = bakeState(
      state('minecraft:oak_stairs[facing=east,half=bottom,shape=straight]'),
      resources,
      fakeAtlas(),
    )
    const bit = (f: string) => 1 << FACES.indexOf(f as (typeof FACES)[number])
    expect(north.opaqueFaces & bit('north')).toBeTruthy()
    expect(north.opaqueFaces & bit('east')).toBe(0)
    expect(east.opaqueFaces & bit('east')).toBeTruthy()
  })

  it('combines multipart models (fence with connections)', () => {
    const post = bakeState(
      state('minecraft:oak_fence[east=false,north=false,south=false,west=false]'),
      resources,
      fakeAtlas(),
    )
    const connected = bakeState(
      state('minecraft:oak_fence[east=true,north=true,south=false,west=false]'),
      resources,
      fakeAtlas(),
    )
    const count = (b: typeof post) =>
      b.geometry[RenderLayer.Opaque].reduce((s, g) => s + (g?.quadCount ?? 0), 0)
    expect(count(connected)).toBeGreaterThan(count(post))
    expect(post.fullFaces).toBe(0)
  })

  it('assigns layers per face: glass is cutout, waterlogged stairs keep their water apart', () => {
    const glass = bakeState(state('minecraft:glass'), resources, fakeAtlas())
    expect(glass.geometry[RenderLayer.Cutout].some(Boolean)).toBe(true)
    expect(glass.opaqueFaces).toBe(0)
    expect(glass.fullFaces).toBe(ALL_SIDES)

    const dry = bakeState(
      state('minecraft:oak_stairs[facing=north,half=bottom,shape=straight,waterlogged=false]'),
      resources,
      fakeAtlas(),
    )
    const wet = bakeState(
      state('minecraft:oak_stairs[facing=north,half=bottom,shape=straight,waterlogged=true]'),
      resources,
      fakeAtlas(),
    )
    // The model is the same as the dry one; the water is drawn apart by the mesher.
    expect(wet.geometry[RenderLayer.Opaque].some(Boolean)).toBe(true)
    expect(wet.geometry[RenderLayer.Translucent].some(Boolean)).toBe(false)
    expect(wet.opaqueFaces).toBe(dry.opaqueFaces)
    expect(wet.fullFaces).toBe(dry.fullFaces)
    expect(wet.fluidRender?.layer).toBe(RenderLayer.Translucent)
    expect(dry.fluidRender).toBeNull()
  })

  it('draws blocks without a JSON model through the special renderers', () => {
    for (const text of [
      'minecraft:chest[facing=north,type=single]',
      'minecraft:oak_sign[rotation=0]',
      'minecraft:red_bed[facing=north,part=foot]',
      'minecraft:white_banner[rotation=4]',
      'minecraft:skeleton_skull[rotation=0]',
      'minecraft:water[level=0]',
    ]) {
      const baked = bakeState(state(text), resources, fakeAtlas())
      expect(baked.missing, text).toBe(false)
      expect(baked.empty, text).toBe(false)
    }
  })

  it('uses the game models of signs and beds instead of the old entity ones', () => {
    const states = [
      'minecraft:oak_sign[rotation=0,waterlogged=false]',
      'minecraft:oak_wall_sign[facing=north,waterlogged=false]',
      'minecraft:oak_hanging_sign[rotation=0,attached=false,waterlogged=false]',
      'minecraft:red_bed[facing=north,part=head,occupied=false]',
    ].map(state)
    const ids = collectTextureIds(states, resources)
    const missing = [...ids].filter(
      (id) => id !== MISSING_TEXTURE && !resources.getTexture(Identifier.parse(id)),
    )
    expect(missing).toEqual([])
    // A waterlogged sign keeps its water.
    const wet = bakeState(
      state('minecraft:oak_sign[rotation=0,waterlogged=true]'),
      resources,
      fakeAtlas(),
    )
    expect(wet.fluidRender).not.toBeNull()
  })

  it('draws banner patterns from the block entity data', () => {
    const banner = state('minecraft:white_banner[rotation=0]')
    const plain = bakeState(banner, resources, fakeAtlas())
    const data = {
      patterns: [
        { pattern: 'stripe_top', color: 'red' },
        { pattern: 'creeper', color: 'black' },
      ],
    }
    const patterned = bakeState(banner, resources, fakeAtlas(), data)
    const quads = (b: typeof plain) =>
      b.geometry.flat().reduce((sum, g) => sum + (g?.quadCount ?? 0), 0)
    expect(quads(patterned)).toBeGreaterThan(quads(plain))
    const ids = collectTextureIds([banner], resources, [data])
    expect(ids.has('minecraft:entity/banner/stripe_top')).toBe(true)
    expect(ids.has('minecraft:entity/banner/creeper')).toBe(true)
  })

  it('bakes fluids apart from the model: height, textures and tint for the mesher', () => {
    const atlas = fakeAtlas()
    const water = bakeState(state('minecraft:water[level=0]'), resources, atlas)
    expect(water.fluid).toBe(FLUID_WATER)
    expect(water.missing).toBe(false)
    expect(water.empty).toBe(false)
    // Water is only fluid: no model of its own.
    expect(water.geometry.flat().some(Boolean)).toBe(false)
    expect(water.opaqueFaces).toBe(0)
    expect(water.fluidHeight).toBeCloseTo(8 / 9)
    // The still and flowing textures are the game's, in their atlas cells.
    const cellOf = (rect: number[]) => atlas.ids[Math.floor(((rect[0] + rect[2]) / 2) * 4096)]
    expect(cellOf(water.fluidRender!.still)).toBe('minecraft:block/water_still')
    expect(cellOf(water.fluidRender!.flow)).toBe('minecraft:block/water_flow')
    expect(water.fluidRender!.layer).toBe(RenderLayer.Translucent)
    // Water is tinted blue; lava is not.
    expect(water.fluidRender!.color[2]).toBeGreaterThan(water.fluidRender!.color[0])
    const lava = bakeState(state('minecraft:lava[level=0]'), resources, atlas)
    expect(lava.fluid).toBe(FLUID_LAVA)
    expect(lava.fluidRender!.color).toEqual([1, 1, 1])
    expect(cellOf(lava.fluidRender!.still)).toBe('minecraft:block/lava_still')

    for (const text of [
      'minecraft:oak_stairs[facing=north,half=bottom,shape=straight,waterlogged=true]',
      'minecraft:seagrass',
      'minecraft:kelp_plant',
      'minecraft:chest[facing=north,type=single,waterlogged=true]',
    ]) {
      const wet = bakeState(state(text), resources, fakeAtlas())
      expect(wet.fluid, text).toBe(FLUID_WATER)
      expect(wet.fluidHeight, text).toBeCloseTo(8 / 9)
      expect(wet.fluidRender, text).not.toBeNull()
      // The model is still drawn, without the water.
      expect(wet.geometry.flat().some(Boolean), text).toBe(true)
      expect(wet.geometry[RenderLayer.Translucent].some(Boolean), text).toBe(false)
    }
    const stone = bakeState(state('minecraft:stone'), resources, fakeAtlas())
    expect(stone.fluid).toBe(0)
    expect(stone.fluidHeight).toBe(0)
    expect(stone.fluidRender).toBeNull()
  })

  it('measures fluid heights like the game (amount / 9)', () => {
    const height = (text: string) => bakeState(state(text), resources, fakeAtlas()).fluidHeight
    expect(height('minecraft:water[level=1]')).toBeCloseTo(7 / 9)
    expect(height('minecraft:water[level=7]')).toBeCloseTo(1 / 9)
    // Falling fluid (level 8–15) is full again.
    expect(height('minecraft:water[level=8]')).toBeCloseTo(8 / 9)
    expect(height('minecraft:lava[level=4]')).toBeCloseTo(4 / 9)
  })

  it('collects the fluid textures of waterlogged blocks', () => {
    const ids = collectTextureIds(
      [state('minecraft:oak_stairs[facing=north,half=bottom,shape=straight,waterlogged=true]')],
      resources,
    )
    expect(ids).toContain('minecraft:block/water_still')
    expect(ids).toContain('minecraft:block/water_flow')
  })

  it('keeps tints from the block colors (grass top is green-tinted)', () => {
    const baked = bakeState(state('minecraft:grass_block[snowy=false]'), resources, fakeAtlas())
    const top = baked.geometry[RenderLayer.Opaque][FACES.indexOf('up')]!
    expect([...top.colors.subarray(0, 3)].some((c) => c < 0.99)).toBe(true)
  })

  it('marks unknown blocks as missing and draws them as a missing-texture cube', () => {
    const atlas = fakeAtlas()
    const baked = bakeState(state('minecraft:block_from_the_future'), resources, atlas)
    expect(baked.missing).toBe(true)
    expect(baked.fullFaces).toBe(ALL_SIDES)
    expect(atlas.ids).toContain(MISSING_TEXTURE)
  })

  it('bakes air as empty', () => {
    expect(bakeState(state('minecraft:air'), resources, fakeAtlas()).empty).toBe(true)
  })

  it('collects the textures a palette needs', () => {
    const ids = collectTextureIds(
      [state('minecraft:stone'), state('minecraft:chest[facing=north]')],
      resources,
    )
    expect(ids).toContain('minecraft:block/stone')
    expect([...ids].some((id) => id.includes('entity/chest'))).toBe(true)
  })

  for (const file of ['house-69.schem', 'STONE-TOWER-from-abfielder.litematic']) {
    it.skipIf(!fs.existsSync(`tests/fixtures/local/${file}`))(
      `resolves every state of ${file}`,
      async () => {
        const { structure } = await readStructureFile(
          new Blob([fs.readFileSync(`tests/fixtures/local/${file}`) as BlobPart]),
        )
        const start = performance.now()
        const { states, missingBlocks } = bakePalette(structure!.palette, resources, fakeAtlas())
        console.log(
          `\n${file}: ${states.length} states baked in ${Math.round(performance.now() - start)} ms`,
        )
        expect(missingBlocks).toEqual([])
        expect(states.slice(1).every((s) => !s.empty)).toBe(true)
        expect(states[0].empty).toBe(true)
        expect(INNER_GROUP).toBe(6)
      },
    )
  }
})
