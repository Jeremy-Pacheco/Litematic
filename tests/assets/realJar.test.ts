/**
 * Checks the jar reader against the official client.jar, when available.
 * The jar is Mojang's property and is never committed: copy it to the
 * git-ignored `tests/fixtures/local/` to run this test.
 */
import { describe, expect, it } from 'vitest'
import { LANG_FILE, readClientJar } from '../../src/lib/assets/minecraftJar'
import { parseLang } from '../../src/lib/assets/loadClientJar'
import { blockToItems } from '../../src/lib/materials/blockToItems'
import { itemDisplayName } from '../../src/lib/materials/materialList'
import { parseBlockStateString } from '../../src/lib/parsers/blockStateString'

interface NodeFs {
  existsSync(path: string): boolean
  readFileSync(path: string): Uint8Array
}
const { getBuiltinModule } = (
  globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }
).process
const fs = getBuiltinModule('node:fs') as NodeFs

const JAR = 'tests/fixtures/local/client-26.3.jar'

describe.skipIf(!fs.existsSync(JAR))('real client.jar 26.3', () => {
  const start = performance.now()
  const { version, files } = readClientJar(new Uint8Array(fs.readFileSync(JAR)))
  const ms = Math.round(performance.now() - start)
  let bytes = 0
  for (const f of files.values()) bytes += f.byteLength
  console.log(
    `\nclient.jar 26.3: ${files.size} files, ${(bytes / 1e6).toFixed(2)} MB extracted in ${ms} ms`,
  )

  it('reads the version', () => {
    expect(version).toEqual({ id: '26.3', dataVersion: 5023, resourcePackFormat: 97, stable: true })
  })

  it('extracts block states, models, textures and the language file', () => {
    const count = (prefix: string) => [...files.keys()].filter((k) => k.startsWith(prefix)).length
    expect(count('assets/minecraft/blockstates/')).toBeGreaterThan(1000)
    expect(count('assets/minecraft/models/block/')).toBeGreaterThan(2000)
    expect(count('assets/minecraft/textures/block/')).toBeGreaterThan(1000)
    expect(files.has(LANG_FILE)).toBe(true)
    expect(files.has('assets/minecraft/textures/gui/title/minecraft.png')).toBe(false)
  })

  it('has an official name for the items of common blocks', () => {
    const lang = parseLang(files.get(LANG_FILE)!)
    for (const text of [
      'minecraft:stone',
      'minecraft:oak_stairs[facing=north]',
      'minecraft:wall_torch',
      'minecraft:redstone_wire',
      'minecraft:wheat',
      'minecraft:red_wall_banner',
      'minecraft:tripwire',
      'minecraft:potted_cactus',
    ]) {
      for (const { item } of blockToItems(parseBlockStateString(text)!)) {
        const key = item.replace(':', '.')
        expect(lang[`block.${key}`] ?? lang[`item.${key}`], item).toBeDefined()
        expect(itemDisplayName(item, lang)).toBe(lang[`block.${key}`] ?? lang[`item.${key}`])
      }
    }
  })
})
