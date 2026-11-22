/**
 * When the browser refuses to store data (private mode, Brave shields,
 * blocked site data), the imported files are kept in memory instead of
 * failing. Node has no IndexedDB, so every cache write here fails exactly as
 * in such a browser.
 */
import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { resolveGameFiles, type FileMap } from '../../src/lib/assets/assetSource'
import { AssetError } from '../../src/lib/assets/errors'
import { loadClientJar, storeOrKeep } from '../../src/lib/assets/loadClientJar'
import { loadResourcePack } from '../../src/lib/assets/loadResourcePack'

const text = (s: string) => new TextEncoder().encode(s)
const json = (v: unknown) => text(JSON.stringify(v))

const JAR = zipSync({
  'version.json': json({ id: '26.3', world_version: 5023, pack_version: { resource_major: 97 } }),
  'assets/minecraft/blockstates/stone.json': json({ variants: { '': { model: 'block/stone' } } }),
  'assets/minecraft/lang/en_us.json': json({ 'block.minecraft.stone': 'Stone' }),
})
const PACK = zipSync({
  'pack.mcmeta': json({ pack: { pack_format: 97, description: 'Test' } }),
  'assets/minecraft/blockstates/stone.json': json({ variants: {} }),
})

describe('storage refused by the browser', () => {
  it('keeps the extracted jar in memory instead of failing', async () => {
    const phases: string[] = []
    const loaded = await loadClientJar(new Blob([JAR]), (p) => phases.push(p))
    expect(phases).toEqual(['reading', 'extracting', 'saving'])
    expect(loaded.meta.version.id).toBe('26.3')
    expect(loaded.lang['block.minecraft.stone']).toBe('Stone')
    expect(loaded.memoryFiles?.has('assets/minecraft/blockstates/stone.json')).toBe(true)
  })

  it('keeps a resource pack in memory too', async () => {
    const pack = await loadResourcePack(Object.assign(new Blob([PACK]), { name: 'p.zip' }), 97)
    expect(pack.meta.name).toBe('p.zip')
    expect(pack.memoryFiles?.has('assets/minecraft/blockstates/stone.json')).toBe(true)
  })

  it('only falls back for storage errors; anything else still fails', async () => {
    expect(await storeOrKeep(async () => {})).toBe(true)
    expect(
      await storeOrKeep(async () => {
        throw new AssetError('storage-failed', 'blocked')
      }),
    ).toBe(false)
    await expect(
      storeOrKeep(async () => {
        throw new AssetError('read-failed', 'other')
      }),
    ).rejects.toThrow('other')
  })
})

describe('resolveGameFiles', () => {
  const file = (s: string) => text(s)
  const game: FileMap = new Map([
    ['a.json', file('game a')],
    ['b.json', file('game b')],
  ])
  const pack: FileMap = new Map([['b.json', file('pack b')]])
  const none = async () => null
  const read = async (files: FileMap | null) =>
    files ? new TextDecoder().decode(files.get('b.json')) : null

  it('prefers the files kept in memory, then the cache', async () => {
    const cached: FileMap = new Map([['b.json', file('cached b')]])
    expect(
      await read(
        await resolveGameFiles({
          memory: { files: game, pack: null },
          cache: { files: async () => cached, pack: none },
        }),
      ),
    ).toBe('game b')
    expect(
      await read(
        await resolveGameFiles({
          memory: { files: null, pack: null },
          cache: { files: async () => cached, pack: none },
        }),
      ),
    ).toBe('cached b')
  })

  it('lays the pack over the game files, from memory or the cache', async () => {
    const merged = await resolveGameFiles({
      memory: { files: game, pack },
      cache: { files: none, pack: none },
    })
    expect(await read(merged)).toBe('pack b')
    expect(merged!.has('a.json')).toBe(true)
    const fromCache = await resolveGameFiles({
      memory: { files: game, pack: null },
      cache: { files: none, pack: async () => pack },
    })
    expect(await read(fromCache)).toBe('pack b')
  })

  it('uses no pack when the cache cannot be read, and nothing without game files', async () => {
    const blocked = async () => {
      throw new AssetError('storage-failed', 'blocked')
    }
    expect(
      await read(
        await resolveGameFiles({
          memory: { files: game, pack: null },
          cache: { files: none, pack: blocked },
        }),
      ),
    ).toBe('game b')
    expect(
      await resolveGameFiles({ memory: { files: null, pack }, cache: { files: none, pack: none } }),
    ).toBeNull()
  })
})
