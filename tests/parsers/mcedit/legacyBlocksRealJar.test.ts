/**
 * Every block the legacy table produces must exist in the current game
 * resources, read from the official client.jar (git-ignored local fixture;
 * skipped when absent).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import legacy from '../../../src/lib/data/legacyBlocks.json'
import { readClientJar } from '../../../src/lib/assets/minecraftJar'
import { isAirId } from '../../../src/lib/parsers/blockState'
import { createLegacyTable } from '../../../src/lib/parsers/mcedit/legacyBlocks'

interface NodeFs {
  existsSync(path: string): boolean
  readFileSync(path: string): Uint8Array
}
const { getBuiltinModule } = (
  globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }
).process
const fs = getBuiltinModule('node:fs') as NodeFs
const JAR = 'tests/fixtures/local/client-26.3.jar'
const BLOCKSTATES = 'assets/minecraft/blockstates/'

describe.skipIf(!fs.existsSync(JAR))('legacy table against the real client.jar 26.3', () => {
  // Read in beforeAll: a skipped suite still runs its body to collect tests.
  let blockstates!: Set<string>
  beforeAll(() => {
    const { files } = readClientJar(new Uint8Array(fs.readFileSync(JAR)))
    blockstates = new Set(
      [...files.keys()]
        .filter((path) => path.startsWith(BLOCKSTATES) && path.endsWith('.json'))
        .map((path) => `minecraft:${path.slice(BLOCKSTATES.length, -'.json'.length)}`),
    )
  })

  it('has a blockstate for every translated id', () => {
    const table = createLegacyTable(legacy.blocks)
    const missing = new Set<string>()
    for (const key of Object.keys(legacy.blocks)) {
      const [id, meta] = key.split(':').map(Number)
      const state = table.resolve(id, meta)
      if (state && !isAirId(state.name) && !blockstates.has(state.name)) missing.add(state.name)
    }
    expect([...missing]).toEqual([])
  })
})
