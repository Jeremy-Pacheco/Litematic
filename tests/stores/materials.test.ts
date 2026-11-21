import { describe, expect, it } from 'vitest'
import {
  materialsStorageKey,
  missingCount,
  parseSavedQuantities,
} from '../../src/lib/stores/materials.svelte'

describe('materialsStorageKey', () => {
  it('identifies a file by name, size and modification time', () => {
    expect(materialsStorageKey({ name: 'casa.schem', size: 1778, lastModified: 42 })).toBe(
      'lv:materials:casa.schem|1778|42',
    )
  })
})

describe('parseSavedQuantities', () => {
  it('reads valid quantities', () => {
    expect(parseSavedQuantities('{"minecraft:stone":40,"create:cogwheel":2}')).toEqual({
      'minecraft:stone': 40,
      'create:cogwheel': 2,
    })
  })

  it('drops malformed data instead of failing', () => {
    expect(parseSavedQuantities(null)).toEqual({})
    expect(parseSavedQuantities('not json')).toEqual({})
    expect(parseSavedQuantities('[1,2]')).toEqual({})
    expect(
      parseSavedQuantities(
        '{"minecraft:stone":-1,"minecraft:dirt":1.5,"minecraft:glass":"3","stone":5,"__proto__":7,"minecraft:sand":4}',
      ),
    ).toEqual({ 'minecraft:sand': 4 })
  })
})

describe('missingCount', () => {
  it('is what is still needed, never negative', () => {
    expect(missingCount(128, 0)).toBe(128)
    expect(missingCount(128, 40)).toBe(88)
    expect(missingCount(128, 200)).toBe(0)
  })
})
