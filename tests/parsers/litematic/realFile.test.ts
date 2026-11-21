/**
 * Checks the parser against a real Litematica file, when available.
 *
 * Real files are not redistributable, so they live in `tests/fixtures/local/`
 * (git-ignored). The test is skipped when the file is missing.
 */
import { describe, expect, it } from 'vitest'
import { readStructureFile } from '../../../src/lib/parsers/readStructureFile'

// Node APIs, typed locally: the test tsconfig targets the browser.
interface NodeFs {
  existsSync(path: string): boolean
  readFileSync(path: string): Uint8Array
}
const { getBuiltinModule } = (
  globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }
).process
const fs = getBuiltinModule('node:fs') as NodeFs

const FILE = 'tests/fixtures/local/STONE-TOWER-from-abfielder.litematic'

describe.skipIf(!fs.existsSync(FILE))('real file: STONE-TOWER', () => {
  it('matches the metadata Litematica wrote', async () => {
    const data = fs.readFileSync(FILE)
    const { structure, info, document } = await readStructureFile(new Blob([data as BlobPart]))
    const metadata = document.root.get('Metadata') as Map<string, unknown>

    expect(info.format).toBe('litematic')
    expect(info.formatVersion).toBe(7)
    expect(info.dataVersion).toBe(4325)
    expect(structure).not.toBeNull()
    const s = structure!

    // Size (34, 57, -38) in the file; enclosing size 34 × 57 × 38.
    expect(s.size).toEqual({ x: 34, y: 57, z: 38 })
    // Litematica's own count of non-air blocks.
    expect(s.nonAirBlocks).toBe(metadata.get('TotalBlocks'))
    expect(s.nonAirBlocks).toBe(5383)
    // 52 palette entries, one of them air.
    expect(s.palette).toHaveLength(52)
    expect(s.regions).toHaveLength(1)
    expect(s.warnings).toEqual({
      invalidPaletteIndices: 0,
      legacyBlockNames: false,
      overlappingBlocks: 0,
      skippedObjects: 0,
    })
  })
})
