import { describe, expect, it } from 'vitest'
import { checkStructureFile, formatFromFileName } from '../../src/lib/utils/structureFile'

describe('formatFromFileName', () => {
  it('recognizes each supported extension', () => {
    expect(formatFromFileName('house.litematic')).toBe('litematic')
    expect(formatFromFileName('house.schem')).toBe('schem')
    expect(formatFromFileName('house.schematic')).toBe('schematic')
  })

  it('is case-insensitive', () => {
    expect(formatFromFileName('HOUSE.LITEMATIC')).toBe('litematic')
    expect(formatFromFileName('Castle.Schem')).toBe('schem')
  })

  it('does not confuse .schem with .schematic', () => {
    expect(formatFromFileName('a.schematic')).toBe('schematic')
    expect(formatFromFileName('a.schem')).toBe('schem')
  })

  it('rejects other names', () => {
    expect(formatFromFileName('house.nbt')).toBeNull()
    expect(formatFromFileName('house.litematic.zip')).toBeNull()
    expect(formatFromFileName('schem')).toBeNull()
    expect(formatFromFileName('')).toBeNull()
  })
})

describe('checkStructureFile', () => {
  it('accepts a non-empty supported file', () => {
    expect(checkStructureFile({ name: 'a.schem', size: 10 })).toEqual({ ok: true, format: 'schem' })
  })

  it('rejects empty files', () => {
    expect(checkStructureFile({ name: 'a.schem', size: 0 })).toEqual({ ok: false, reason: 'empty' })
  })

  it('rejects unsupported files before checking size', () => {
    expect(checkStructureFile({ name: 'a.txt', size: 0 })).toEqual({
      ok: false,
      reason: 'unsupported',
    })
  })
})
