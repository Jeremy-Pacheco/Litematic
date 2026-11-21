/**
 * Checks the Sponge parser against a real WorldEdit file, when available.
 * Real files live in the git-ignored `tests/fixtures/local/`; the test is
 * skipped when the file is missing.
 */
import { describe, expect, it } from 'vitest'
import { readStructureFile } from '../../../src/lib/parsers/readStructureFile'

interface NodeFs {
  existsSync(path: string): boolean
  readFileSync(path: string): Uint8Array
}
const { getBuiltinModule } = (
  globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }
).process
const fs = getBuiltinModule('node:fs') as NodeFs

const FILE = 'tests/fixtures/local/house-69.schem'

describe.skipIf(!fs.existsSync(FILE))('real file: house-69 (WorldEdit 7.4.6, Sponge v3)', () => {
  it('matches an independent decoding of the file', async () => {
    const { structure, info } = await readStructureFile(
      new Blob([fs.readFileSync(FILE) as BlobPart]),
    )
    expect(info).toMatchObject({ format: 'schem', formatVersion: 3, dataVersion: 5023 })
    const s = structure!
    expect(s.size).toEqual({ x: 12, y: 14, z: 15 })
    // 711 non-air blocks, counted with a separate decoder over Deepslate's NBT.
    expect(s.nonAirBlocks).toBe(711)
    // 40 palette entries including air.
    expect(s.palette).toHaveLength(40)
    expect(s.blockEntities).toHaveLength(8)
    expect(s.entities).toHaveLength(6)
    expect(s.warnings).toEqual({
      invalidPaletteIndices: 0,
      legacyBlockNames: false,
      overlappingBlocks: 0,
      skippedObjects: 0,
    })
  })
})
