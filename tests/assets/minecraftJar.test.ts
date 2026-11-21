import { zipSync, type Zippable } from 'fflate'
import { describe, expect, it } from 'vitest'
import { AssetError } from '../../src/lib/assets/errors'
import { parseLang } from '../../src/lib/assets/loadClientJar'
import { isWantedJarEntry, readClientJar } from '../../src/lib/assets/minecraftJar'
import { itemDisplayName } from '../../src/lib/materials/materialList'

const text = (s: string) => new TextEncoder().encode(s)
const json = (v: unknown) => text(JSON.stringify(v))

function fakeJar(overrides: Zippable = {}): Uint8Array {
  return zipSync({
    'version.json': json({
      id: '26.3',
      world_version: 5023,
      stable: true,
      pack_version: { resource_major: 97, resource_minor: 1 },
    }),
    'net/minecraft/client/Main.class': new Uint8Array([0xca, 0xfe]),
    'assets/minecraft/blockstates/stone.json': json({ variants: { '': { model: 'block/stone' } } }),
    'assets/minecraft/models/block/stone.json': json({ parent: 'block/cube_all' }),
    'assets/minecraft/models/item/stone.json': json({ parent: 'block/stone' }),
    'assets/minecraft/items/stone.json': json({ model: { type: 'model' } }),
    'assets/minecraft/textures/block/stone.png': new Uint8Array([0x89, 0x50]),
    'assets/minecraft/textures/block/water_still.png.mcmeta': json({ animation: {} }),
    'assets/minecraft/textures/entity/chest/normal.png': new Uint8Array([1]),
    'assets/minecraft/textures/gui/title.png': new Uint8Array([1]),
    'assets/minecraft/shaders/core/x.vsh': text('void main(){}'),
    'assets/minecraft/lang/en_us.json': json({ 'block.minecraft.stone': 'Stone' }),
    ...overrides,
  })
}

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn()
  } catch (error) {
    expect((error as AssetError).code).toBe(code)
    return
  }
  throw new Error('Expected an AssetError')
}

describe('isWantedJarEntry', () => {
  it('selects only what the viewer needs', () => {
    expect(isWantedJarEntry('version.json')).toBe(true)
    expect(isWantedJarEntry('assets/minecraft/blockstates/oak_stairs.json')).toBe(true)
    expect(isWantedJarEntry('assets/minecraft/models/block/cube_all.json')).toBe(true)
    expect(isWantedJarEntry('assets/minecraft/textures/block/stone.png')).toBe(true)
    expect(isWantedJarEntry('assets/minecraft/textures/colormap/grass.png')).toBe(true)
    expect(isWantedJarEntry('assets/minecraft/lang/en_us.json')).toBe(true)
    expect(isWantedJarEntry('assets/minecraft/textures/gui/title.png')).toBe(false)
    expect(isWantedJarEntry('assets/minecraft/shaders/core/x.vsh')).toBe(false)
    expect(isWantedJarEntry('net/minecraft/client/Main.class')).toBe(false)
    expect(isWantedJarEntry('assets/minecraft/textures/block/evil.exe')).toBe(false)
  })
})

describe('readClientJar', () => {
  it('reads the version and extracts only wanted files', () => {
    const { version, files } = readClientJar(fakeJar())
    expect(version).toEqual({ id: '26.3', dataVersion: 5023, resourcePackFormat: 97, stable: true })
    expect([...files.keys()].sort()).toEqual([
      'assets/minecraft/blockstates/stone.json',
      'assets/minecraft/items/stone.json',
      'assets/minecraft/lang/en_us.json',
      'assets/minecraft/models/block/stone.json',
      'assets/minecraft/models/item/stone.json',
      'assets/minecraft/textures/block/stone.png',
      'assets/minecraft/textures/block/water_still.png.mcmeta',
      'assets/minecraft/textures/entity/chest/normal.png',
      'version.json',
    ])
  })

  it('accepts older pack_version formats', () => {
    const numeric = fakeJar({
      'version.json': json({ id: '1.20.1', world_version: 3465, pack_version: 15 }),
    })
    expect(readClientJar(numeric).version.resourcePackFormat).toBe(15)
    const object = fakeJar({
      'version.json': json({
        id: '1.21',
        world_version: 3953,
        pack_version: { resource: 34, data: 48 },
      }),
    })
    expect(readClientJar(object).version.resourcePackFormat).toBe(34)
  })

  it('rejects a server jar (no assets)', () => {
    const server = zipSync({
      'version.json': json({ id: '26.3', world_version: 5023 }),
      'net/minecraft/server/Main.class': new Uint8Array([1]),
    })
    expectCode(() => readClientJar(server), 'not-client-jar')
  })

  it('rejects an invalid version.json', () => {
    expectCode(() => readClientJar(fakeJar({ 'version.json': text('{broken') })), 'not-client-jar')
    expectCode(() => readClientJar(fakeJar({ 'version.json': json({ id: 26 }) })), 'not-client-jar')
  })

  it('rejects non-ZIP files', () => {
    expectCode(() => readClientJar(text('just text')), 'not-zip')
  })
})

describe('parseLang', () => {
  it('keeps only string values', () => {
    expect(parseLang(json({ a: 'A', b: 2, c: { d: 'x' } }))).toEqual({ a: 'A' })
  })

  it('rejects files that are not a JSON object', () => {
    expect(() => parseLang(text('[1]'))).toThrow(AssetError)
    expect(() => parseLang(text('nope'))).toThrow(AssetError)
  })
})

describe('itemDisplayName with the game language', () => {
  const lang = {
    'block.minecraft.oak_stairs': 'Oak Stairs',
    'item.minecraft.redstone': 'Redstone Dust',
    'item.minecraft.wheat_seeds': 'Wheat Seeds',
  }

  it('uses the official block or item name', () => {
    expect(itemDisplayName('minecraft:oak_stairs', lang)).toBe('Oak Stairs')
    expect(itemDisplayName('minecraft:redstone', lang)).toBe('Redstone Dust')
    expect(itemDisplayName('minecraft:wheat_seeds', lang)).toBe('Wheat Seeds')
  })

  it('falls back to the readable id when the name is unknown', () => {
    expect(itemDisplayName('minecraft:future_block', lang)).toBe('Future block')
    expect(itemDisplayName('minecraft:oak_stairs', null)).toBe('Oak stairs')
  })
})
