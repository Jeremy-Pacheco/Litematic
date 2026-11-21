import {
  NbtByte,
  NbtCompound as DsCompound,
  NbtDouble,
  NbtFile,
  NbtFloat,
  NbtInt,
  NbtIntArray as DsIntArray,
  NbtList as DsList,
  NbtLong,
  NbtLongArray as DsLongArray,
  NbtShort,
  NbtString,
  NbtByteArray as DsByteArray,
} from 'deepslate/nbt'
import { describe, expect, it } from 'vitest'
import { StructureReadError } from '../../../src/lib/parsers/errors'
import { getCompound, getList } from '../../../src/lib/parsers/nbt/access'
import { readNbt } from '../../../src/lib/parsers/nbt/NbtReader'
import { NbtList, NbtLongArray, NbtType } from '../../../src/lib/types/nbt'
import {
  ByteWriter,
  byte,
  byteArray,
  compound,
  double,
  encodeNbt,
  float,
  int,
  intArray,
  list,
  long,
  longArray,
  short,
  str,
} from '../../helpers/nbt'

function expectInvalid(data: Uint8Array, maxDepth?: number): StructureReadError {
  try {
    readNbt(data, { maxDepth })
  } catch (error) {
    expect(error).toBeInstanceOf(StructureReadError)
    expect((error as StructureReadError).code).toBe('invalid-nbt')
    return error as StructureReadError
  }
  throw new Error('Expected readNbt to throw')
}

describe('readNbt', () => {
  it('reads every tag type', () => {
    const data = encodeNbt(
      {
        b: byte(-5),
        s: short(-1234),
        i: int(2_000_000_000),
        l: long(-9_000_000_000_000_000_000n),
        f: float(1.5),
        d: double(Math.PI),
        str: str('minecraft:stone'),
        ba: byteArray(new Int8Array([1, -2, 3])),
        ia: intArray([7, -8, 2_147_483_647]),
        la: longArray([1n, -1n, 0x0123_4567_89ab_cdefn]),
        li: list(NbtType.Int, [int(1), int(2)]),
        c: compound({ nested: str('yes') }),
      },
      'root name',
    )

    const { name, root } = readNbt(data)
    expect(name).toBe('root name')
    expect(root.get('b')).toBe(-5)
    expect(root.get('s')).toBe(-1234)
    expect(root.get('i')).toBe(2_000_000_000)
    expect(root.get('l')).toBe(-9_000_000_000_000_000_000n)
    expect(root.get('f')).toBe(1.5)
    expect(root.get('d')).toBe(Math.PI)
    expect(root.get('str')).toBe('minecraft:stone')
    expect([...(root.get('ba') as Int8Array)]).toEqual([1, -2, 3])
    expect([...(root.get('ia') as Int32Array)]).toEqual([7, -8, 2_147_483_647])

    const la = root.get('la') as NbtLongArray
    expect(la).toBeInstanceOf(NbtLongArray)
    expect([la.get(0), la.get(1), la.get(2)]).toEqual([1n, -1n, 0x0123_4567_89ab_cdefn])
    expect([...la.words.subarray(4, 6)]).toEqual([0x0123_4567, 0x89ab_cdef])

    const li = getList(root, 'li')
    expect(li?.elementType).toBe(NbtType.Int)
    expect(li?.items).toEqual([1, 2])
    expect(getCompound(root, 'c')?.get('nested')).toBe('yes')
  })

  it('returns byte arrays as views over the input, without copying', () => {
    const data = encodeNbt({ blocks: byteArray(new Int8Array(1000).fill(7)) })
    const blocks = readNbt(data).root.get('blocks') as Int8Array
    expect(blocks.buffer).toBe(data.buffer)
    expect(blocks.length).toBe(1000)
  })

  it('reads empty lists and lists of compounds', () => {
    const data = encodeNbt({
      empty: list(NbtType.End, []),
      entities: list(NbtType.Compound, [compound({ id: str('a') }), compound({ id: str('b') })]),
    })
    const { root } = readNbt(data)
    expect((root.get('empty') as NbtList).items).toEqual([])
    const ids = (root.get('entities') as NbtList).items.map((c) =>
      (c as Map<string, unknown>).get('id'),
    )
    expect(ids).toEqual(['a', 'b'])
  })

  it('keeps keys such as __proto__ as plain data', () => {
    // Computed key: a literal `__proto__:` would set the prototype instead.
    const { root } = readNbt(encodeNbt({ ['__proto__']: str('x'), constructor: int(1) }))
    expect(root.get('__proto__')).toBe('x')
    expect(root.get('constructor')).toBe(1)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('matches what Deepslate writes', () => {
    const file = NbtFile.create()
    file.root
      .set('byte', new NbtByte(-3))
      .set('short', new NbtShort(300))
      .set('int', new NbtInt(-70000))
      .set('long', new NbtLong(123456789012345n))
      .set('float', new NbtFloat(0.25))
      .set('double', new NbtDouble(-2.5))
      .set('string', new NbtString('Ñandú · ブロック'))
      .set('bytes', new DsByteArray([1, 2, -128]))
      .set('ints', new DsIntArray([5, -6]))
      .set('longs', new DsLongArray([10n, -20n]))
      .set('list', new DsList([new NbtString('a'), new NbtString('b')]))
      .set('compound', new DsCompound().set('x', new NbtInt(1)))

    const { root } = readNbt(file.write())
    expect(root.get('byte')).toBe(-3)
    expect(root.get('short')).toBe(300)
    expect(root.get('int')).toBe(-70000)
    expect(root.get('long')).toBe(123456789012345n)
    expect(root.get('float')).toBe(0.25)
    expect(root.get('double')).toBe(-2.5)
    expect(root.get('string')).toBe('Ñandú · ブロック')
    expect([...(root.get('bytes') as Int8Array)]).toEqual([1, 2, -128])
    expect([...(root.get('ints') as Int32Array)]).toEqual([5, -6])
    const longs = root.get('longs') as NbtLongArray
    expect([longs.get(0), longs.get(1)]).toEqual([10n, -20n])
    expect((root.get('list') as NbtList).items).toEqual(['a', 'b'])
    expect(getCompound(root, 'compound')?.get('x')).toBe(1)
  })
})

describe('readNbt with malformed data', () => {
  it('requires a compound root', () => {
    const w = new ByteWriter().u8(NbtType.List).string('').u8(0).i32(0)
    expectInvalid(w.result())
  })

  it('rejects every truncation of a valid file', () => {
    const data = encodeNbt({
      name: str('test'),
      values: intArray([1, 2, 3]),
      nested: compound({ list: list(NbtType.Short, [short(1), short(2)]) }),
    })
    for (let length = 0; length < data.length; length++) {
      expectInvalid(data.subarray(0, length))
    }
  })

  it('rejects impossible lengths before allocating', () => {
    // Claims 2 billion longs (16 GB) in a 20-byte file: must fail instantly.
    const w = new ByteWriter()
      .u8(10)
      .string('')
      .u8(NbtType.LongArray)
      .string('a')
      .i32(2_000_000_000)
    const start = performance.now()
    expectInvalid(w.result())
    expect(performance.now() - start).toBeLessThan(50)
  })

  it('rejects a huge list of compounds that does not fit', () => {
    const w = new ByteWriter()
      .u8(10)
      .string('')
      .u8(NbtType.List)
      .string('l')
      .u8(NbtType.Compound)
      .i32(1_000_000_000)
    expectInvalid(w.result())
  })

  it('rejects negative lengths', () => {
    const w = new ByteWriter().u8(10).string('').u8(NbtType.ByteArray).string('a').i32(-1)
    expectInvalid(w.result())
  })

  it('rejects unknown tag types', () => {
    const w = new ByteWriter().u8(10).string('').u8(99).string('x')
    expectInvalid(w.result())
  })

  it('rejects non-empty lists of End tags', () => {
    const w = new ByteWriter().u8(10).string('').u8(NbtType.List).string('l').u8(0).i32(3).u8(0)
    expectInvalid(w.result())
  })

  it('stops excessive nesting instead of overflowing the stack', () => {
    const depth = 10_000
    const w = new ByteWriter().u8(10).string('').u8(NbtType.List).string('deep')
    for (let i = 0; i < depth; i++) w.u8(NbtType.List).i32(1)
    w.u8(NbtType.End).i32(0)
    const error = expectInvalid(w.result())
    expect(error.message).toMatch(/Nesting/)
  })

  it('honours a custom depth limit', () => {
    const data = encodeNbt({ a: compound({ b: compound({ c: compound({}) }) }) })
    expect(() => readNbt(data, { maxDepth: 4 })).not.toThrow()
    expectInvalid(data, 3)
  })
})
