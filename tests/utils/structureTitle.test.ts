import { describe, expect, it } from 'vitest'
import { structureTitle } from '../../src/lib/utils/structureTitle'

describe('structureTitle', () => {
  it('uses a meaningful structure name', () => {
    expect(structureTitle('Stone tower', 'tower.litematic')).toBe('Stone tower')
    expect(structureTitle('  Casa  ', 'casa.schem')).toBe('Casa')
  })

  it('falls back to the file name for missing or generic names', () => {
    expect(structureTitle(null, 'a.schem')).toBe('a.schem')
    expect(structureTitle(undefined, 'a.schem')).toBe('a.schem')
    expect(structureTitle('   ', 'a.schem')).toBe('a.schem')
    expect(structureTitle('Unnamed', 'tower.litematic')).toBe('tower.litematic')
    expect(structureTitle('UNNAMED', 'tower.litematic')).toBe('tower.litematic')
  })
})
