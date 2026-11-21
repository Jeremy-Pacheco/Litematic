import { describe, expect, it } from 'vitest'
import { droppedKind } from '../../src/lib/import/openAssetFiles'

describe('droppedKind', () => {
  it('routes by extension, ignoring case', () => {
    expect(droppedKind('26.3.jar')).toBe('jar')
    expect(droppedKind('Faithful 32x.ZIP')).toBe('pack')
    expect(droppedKind('house.schem')).toBe('structure')
    expect(droppedKind('tower.litematic')).toBe('structure')
    expect(droppedKind('no-extension')).toBe('structure')
  })
})
