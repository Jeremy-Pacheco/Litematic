import { describe, expect, it } from 'vitest'
import { parseBlockStateString } from '../../src/lib/parsers/blockStateString'
import { createList, NbtType, type NbtCompound, type NbtValue } from '../../src/lib/types/nbt'
import { message, signPlacement, signTextColor, signTextOf } from '../../src/lib/viewer/signText'

const compound = (entries: [string, NbtValue][]): NbtCompound => new Map(entries)
const strings = (items: NbtValue[]) => createList(NbtType.String, items)

describe('signTextOf', () => {
  it('reads front and back text of 1.20+ signs', () => {
    const nbt = compound([
      [
        'front_text',
        compound([
          ['messages', strings(['{"text":"Hola"}', '""', '{"text":"mundo","extra":["!"]}', '""'])],
          ['color', 'red'],
          ['has_glowing_text', 1],
        ]),
      ],
      ['back_text', compound([['messages', strings(['""', '""', '""', '""'])]])],
    ])
    expect(signTextOf('minecraft:sign', nbt)).toEqual({
      front: { lines: ['Hola', '', 'mundo!', ''], color: 'red', glowing: true },
      back: null,
    })
  })

  it('reads 1.21.5+ components stored as NBT and plain strings', () => {
    const nbt = compound([
      [
        'front_text',
        compound([['messages', createList(NbtType.Compound, [compound([['text', 'Tienda']])])]]),
      ],
    ])
    expect(signTextOf('minecraft:sign', nbt)?.front?.lines).toEqual(['Tienda', '', '', ''])
    expect(message('texto sin JSON')).toBe('texto sin JSON')
  })

  it('reads pre-1.20 signs and Sponge v3 data', () => {
    const legacy = compound([
      ['Text1', '{"text":"Arriba"}'],
      ['Text2', '""'],
      ['Text3', '""'],
      ['Text4', '{"text":"Abajo"}'],
      ['Color', 'blue'],
    ])
    expect(signTextOf('minecraft:sign', legacy)?.front).toEqual({
      lines: ['Arriba', '', '', 'Abajo'],
      color: 'blue',
      glowing: false,
    })
    expect(signTextOf('minecraft:sign', compound([['Data', legacy]]))?.front?.lines[0]).toBe(
      'Arriba',
    )
  })

  it('ignores blank signs, other block entities and control characters', () => {
    const blank = compound([['front_text', compound([['messages', strings(['""', '""'])]])]])
    expect(signTextOf('minecraft:sign', blank)).toBeNull()
    expect(signTextOf('minecraft:chest', blank)).toBeNull()
    expect(message('{"text":"a\\u0007b"}')).toBe('ab')
    expect(message('x'.repeat(500))).toHaveLength(90)
  })
})

describe('signPlacement', () => {
  const state = (s: string) => parseBlockStateString(s)!

  it('places standing and wall signs, not hanging ones', () => {
    expect(signPlacement(state('minecraft:oak_sign[rotation=4]'))).toEqual({
      kind: 'standing',
      angle: Math.PI / 2,
    })
    expect(signPlacement(state('minecraft:oak_wall_sign[facing=south]'))).toEqual({
      kind: 'wall',
      angle: Math.PI,
    })
    expect(signPlacement(state('minecraft:oak_hanging_sign[rotation=0]'))).toBeNull()
    expect(signPlacement(state('minecraft:oak_sign[rotation=99]'))).toBeNull()
    expect(signPlacement(state('minecraft:stone'))).toBeNull()
  })
})

describe('signTextColor', () => {
  it('darkens text that does not glow, except black', () => {
    expect(signTextColor({ lines: [], color: 'red', glowing: true })).toBe('rgb(255 0 0)')
    expect(signTextColor({ lines: [], color: 'red', glowing: false })).toBe('rgb(102 0 0)')
    expect(signTextColor({ lines: [], color: 'black', glowing: false })).toBe('rgb(0 0 0)')
  })
})
