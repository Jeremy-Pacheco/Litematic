import { describe, expect, it } from 'vitest'
import { parseBlockStateString } from '../../src/lib/parsers/blockStateString'

describe('parseBlockStateString', () => {
  it('parses ids without properties', () => {
    expect(parseBlockStateString('minecraft:stone')).toEqual({
      name: 'minecraft:stone',
      properties: {},
    })
  })

  it('parses properties', () => {
    expect(parseBlockStateString('minecraft:oak_stairs[facing=north,half=bottom]')).toEqual({
      name: 'minecraft:oak_stairs',
      properties: { facing: 'north', half: 'bottom' },
    })
  })

  it('adds the minecraft namespace when missing', () => {
    expect(parseBlockStateString('stone')?.name).toBe('minecraft:stone')
  })

  it('keeps other namespaces', () => {
    expect(parseBlockStateString('create:cogwheel[axis=y]')).toEqual({
      name: 'create:cogwheel',
      properties: { axis: 'y' },
    })
  })

  it('tolerates spaces and empty brackets', () => {
    expect(
      parseBlockStateString('minecraft:lever[ face = wall , powered=false ]')?.properties,
    ).toEqual({
      face: 'wall',
      powered: 'false',
    })
    expect(parseBlockStateString('minecraft:stone[]')).toEqual({
      name: 'minecraft:stone',
      properties: {},
    })
  })

  it('keeps __proto__ as an ordinary property', () => {
    const state = parseBlockStateString('minecraft:x[__proto__=a]')
    expect(Object.getOwnPropertyNames(state?.properties)).toEqual(['__proto__'])
    expect(Object.getPrototypeOf(state?.properties)).toBe(Object.prototype)
  })

  it('rejects malformed text', () => {
    for (const bad of [
      '',
      'Minecraft:Stone',
      'minecraft:stone[facing=north',
      'minecraft:stone[facing]',
      'minecraft:stone[=north]',
      'minecraft:stone[facing=]',
      'minecraft:stone[a=b]x',
      'minecraft:stone[a=[b]]',
    ]) {
      expect(parseBlockStateString(bad), bad).toBeNull()
    }
  })
})
