import { zipSync, type Zippable } from 'fflate'
import { describe, expect, it } from 'vitest'
import type { AssetError } from '../../src/lib/assets/errors'
import {
  formatRange,
  isAcceptablePng,
  isWantedPackEntry,
  packCompatibility,
  readResourcePack,
  textOf,
} from '../../src/lib/assets/resourcePack'

const text = (s: string) => new TextEncoder().encode(s)
const json = (v: unknown) => text(JSON.stringify(v))

/** Minimal PNG: signature + IHDR with the given size (enough for the header check). */
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const view = new DataView(bytes.buffer)
  view.setUint32(8, 13)
  view.setUint32(12, 0x49484452) // IHDR
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

const MCMETA = json({ pack: { pack_format: 97, description: '§aMy §lpack' } })

function pack(files: Zippable): Uint8Array {
  return zipSync(files)
}

function expectCode(fn: () => unknown, code: string): void {
  let thrown: unknown = null
  try {
    fn()
  } catch (error) {
    thrown = error
  }
  expect((thrown as AssetError | null)?.code).toBe(code)
}

describe('readResourcePack', () => {
  it('reads the pack info, icon and the files the viewer uses', () => {
    const result = readResourcePack(
      pack({
        'pack.mcmeta': MCMETA,
        'pack.png': png(64, 64),
        'assets/minecraft/textures/block/stone.png': png(16, 16),
        'assets/minecraft/models/block/stone.json': json({ parent: 'block/cube_all' }),
        'assets/minecraft/blockstates/stone.json': json({ variants: {} }),
        'assets/minecraft/sounds.json': json({}),
        'assets/minecraft/textures/gui/title.png': png(16, 16),
      }),
      97,
    )
    expect(result.info).toMatchObject({
      description: 'My pack',
      packFormat: 97,
      supported: { min: 97, max: 97 },
      overlays: [],
      rejectedTextures: [],
    })
    expect(result.icon).not.toBeNull()
    expect([...result.files.keys()].sort()).toEqual([
      'assets/minecraft/blockstates/stone.json',
      'assets/minecraft/models/block/stone.json',
      'assets/minecraft/textures/block/stone.png',
      'assets/minecraft/textures/gui/title.png',
    ])
  })

  it('accepts a pack zipped together with its folder', () => {
    const result = readResourcePack(
      pack({
        'MyPack/pack.mcmeta': MCMETA,
        'MyPack/assets/minecraft/textures/block/dirt.png': png(16, 16),
      }),
      97,
    )
    expect([...result.files.keys()]).toEqual(['assets/minecraft/textures/block/dirt.png'])
  })

  it('applies the overlays for the game format, in order', () => {
    const files = {
      'pack.mcmeta': json({
        pack: { pack_format: 34, supported_formats: [34, 99] },
        overlays: {
          entries: [
            { formats: [90, 99], directory: 'new' },
            { formats: { min_inclusive: 1, max_inclusive: 40 }, directory: 'old' },
            { min_format: 95, max_format: [99, 0], directory: 'newest' },
            { formats: [90, 99], directory: '../escape' },
          ],
        },
      }),
      'assets/minecraft/textures/block/a.png': png(16, 16),
      'new/assets/minecraft/textures/block/a.png': png(32, 32),
      'newest/assets/minecraft/textures/block/a.png': png(64, 64),
      'old/assets/minecraft/textures/block/b.png': png(16, 16),
    }
    const result = readResourcePack(pack(files), 97)
    expect(result.info.overlays).toEqual(['new', 'newest'])
    expect(result.info.supported).toEqual({ min: 34, max: 99 })
    // The last applicable overlay wins.
    expect(
      new DataView(result.files.get('assets/minecraft/textures/block/a.png')!.buffer).getUint32(16),
    ).toBe(64)
    expect(result.files.has('assets/minecraft/textures/block/b.png')).toBe(false)
    // Without a known game format only the base files are used.
    expect(readResourcePack(pack(files), null).info.overlays).toEqual([])
  })

  it('ignores oversized or fake PNG textures (the game ones are used)', () => {
    const result = readResourcePack(
      pack({
        'pack.mcmeta': MCMETA,
        'assets/minecraft/textures/block/huge.png': png(8192, 8192),
        'assets/minecraft/textures/block/huge.png.mcmeta': json({ animation: {} }),
        'assets/minecraft/textures/block/fake.png': text('<svg/>'),
        'assets/minecraft/textures/block/ok.png': png(512, 512),
      }),
      97,
    )
    expect(result.info.rejectedTextures).toEqual([
      'assets/minecraft/textures/block/fake.png',
      'assets/minecraft/textures/block/huge.png',
    ])
    expect([...result.files.keys()]).toEqual(['assets/minecraft/textures/block/ok.png'])
  })

  it('rejects archives that are not resource packs', () => {
    expectCode(() => readResourcePack(pack({ 'readme.txt': text('hi') }), 97), 'not-resource-pack')
    expectCode(
      () => readResourcePack(pack({ 'pack.mcmeta': text('{ nope') }), 97),
      'not-resource-pack',
    )
    expectCode(
      () => readResourcePack(pack({ 'pack.mcmeta': json({ other: 1 }) }), 97),
      'not-resource-pack',
    )
    // Two candidate folders: ambiguous.
    expectCode(
      () => readResourcePack(pack({ 'a/pack.mcmeta': MCMETA, 'b/pack.mcmeta': MCMETA }), 97),
      'not-resource-pack',
    )
    expectCode(() => readResourcePack(text('not a zip'), 97), 'not-zip')
  })

  it('keeps the ZIP safety checks', () => {
    // Entry names with ".." are rejected before anything is extracted.
    const evil = pack({ 'pack.mcmeta': MCMETA, '../evil.png': png(16, 16) })
    expectCode(() => readResourcePack(evil, 97), 'unsafe-archive')
    const big = pack({
      'pack.mcmeta': MCMETA,
      'assets/minecraft/models/block/x.json': new Uint8Array(4096),
    })
    expectCode(() => readResourcePack(big, 97, { maxEntryBytes: 1024 }), 'too-large')
  })
})

describe('pack helpers', () => {
  it('extracts only pack.mcmeta, the icon and block assets', () => {
    expect(isWantedPackEntry('pack.mcmeta')).toBe(true)
    expect(isWantedPackEntry('Pack/assets/minecraft/textures/block/a.png')).toBe(true)
    expect(isWantedPackEntry('assets/minecraft/sounds/a.ogg')).toBe(false)
    expect(isWantedPackEntry('assets/minecraft/shaders/core/x.fsh')).toBe(false)
    expect(isWantedPackEntry('a/b/c/assets/minecraft/textures/block/a.png')).toBe(false)
  })

  it('reads every shape of format range', () => {
    expect(formatRange({ supported_formats: 15 })).toEqual({ min: 15, max: 15 })
    expect(formatRange({ formats: [20, 10] })).toEqual({ min: 10, max: 20 })
    expect(formatRange({ formats: { min_inclusive: 1, max_inclusive: 5 } })).toEqual({
      min: 1,
      max: 5,
    })
    expect(formatRange({ min_format: [65, 2], max_format: 97 })).toEqual({ min: 65, max: 97 })
    expect(formatRange({})).toBeNull()
  })

  it('flattens text components and drops formatting codes', () => {
    expect(textOf({ text: '§6Gold', extra: [' and ', { text: 'more' }] })).toBe('Gold and more')
    expect(textOf(['a', 'b', 3])).toBe('ab3')
    expect(textOf(null)).toBe('')
  })

  it('checks PNG headers', () => {
    expect(isAcceptablePng(png(16, 16))).toBe(true)
    expect(isAcceptablePng(png(16, 8192))).toBe(true) // animation strip
    expect(isAcceptablePng(png(8192, 16))).toBe(false)
    expect(isAcceptablePng(png(4096, 8192))).toBe(false) // too many pixels
    expect(isAcceptablePng(png(0, 16))).toBe(false)
    expect(isAcceptablePng(text('GIF89a........................'))).toBe(false)
  })

  it('compares the pack formats with the game', () => {
    expect(packCompatibility({ min: 90, max: 99 }, 97)).toBe('compatible')
    expect(packCompatibility({ min: 34, max: 34 }, 97)).toBe('other-version')
    expect(packCompatibility(null, 97)).toBe('unknown')
    expect(packCompatibility({ min: 1, max: 2 }, null)).toBe('unknown')
  })
})
