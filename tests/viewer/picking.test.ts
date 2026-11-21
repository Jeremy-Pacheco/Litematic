import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../../src/lib/types/structure'
import { pickBlock } from '../../src/lib/viewer/picking'
import { nbtTree } from '../../src/lib/viewer/nbtTree'
import {
  createList,
  createLongArray,
  NbtType,
  type NbtCompound,
  type NbtValue,
} from '../../src/lib/types/nbt'

const size: Vec3 = { x: 4, y: 4, z: 4 }

/** Solid where `cells` lists a position. */
function grid(...cells: [number, number, number][]) {
  const set = new Set(cells.map((c) => c.join()))
  return (x: number, y: number, z: number) => set.has(`${x},${y},${z}`)
}

const ray = (origin: [number, number, number], direction: [number, number, number]) => ({
  origin: { x: origin[0], y: origin[1], z: origin[2] },
  direction: { x: direction[0], y: direction[1], z: direction[2] },
})

describe('pickBlock', () => {
  it('finds the first block along the ray from outside the structure', () => {
    const isSolid = grid([2, 1, 1], [3, 1, 1])
    expect(pickBlock(ray([-5, 1.5, 1.5], [1, 0, 0]), { size, isSolid })).toEqual({
      x: 2,
      y: 1,
      z: 1,
    })
  })

  it('works with diagonal rays and from inside the structure', () => {
    const isSolid = grid([3, 3, 3])
    expect(pickBlock(ray([0.5, 0.5, 0.5], [1, 1, 1]), { size, isSolid })).toEqual({
      x: 3,
      y: 3,
      z: 3,
    })
  })

  it('returns null when the ray misses the structure or finds only air', () => {
    const isSolid = grid([1, 1, 1])
    expect(pickBlock(ray([-5, 10, 1.5], [1, 0, 0]), { size, isSolid })).toBeNull()
    expect(pickBlock(ray([-5, 2.5, 2.5], [1, 0, 0]), { size, isSolid })).toBeNull()
    expect(pickBlock(ray([-5, 1.5, 1.5], [-1, 0, 0]), { size, isSolid })).toBeNull()
  })

  it('skips the hidden layers', () => {
    // Looking down a column: the top block is hidden by the layer range.
    const isSolid = grid([1, 3, 1], [1, 1, 1])
    const down = ray([1.5, 10, 1.5], [0, -1, 0])
    expect(pickBlock(down, { size, isSolid })).toEqual({ x: 1, y: 3, z: 1 })
    expect(pickBlock(down, { size, isSolid, range: { min: 0, max: 2 } })).toEqual({
      x: 1,
      y: 1,
      z: 1,
    })
    expect(pickBlock(down, { size, isSolid, range: { min: 2, max: 2 } })).toBeNull()
  })
})

describe('nbtTree', () => {
  const nbt: NbtCompound = new Map<string, NbtValue>([
    ['id', 'minecraft:chest'],
    ['x', 4],
    ['time', 12n],
    ['ratio', 0.1 + 0.2],
    ['data', new Int8Array(3)],
    ['longs', createLongArray(new Uint32Array(4))],
    [
      'Items',
      createList(NbtType.Compound, [
        new Map<string, NbtValue>([
          ['id', 'minecraft:stone'],
          ['count', 64],
        ]),
      ]),
    ],
  ])

  it('shows values as text and nests compounds and lists', () => {
    const tree = nbtTree(nbt)
    const byKey = Object.fromEntries(tree.map((n) => [n.key, n]))
    expect(byKey.id.value).toBe('"minecraft:chest"')
    expect(byKey.x.value).toBe('4')
    expect(byKey.time.value).toBe('12L')
    expect(byKey.ratio.value).toBe('0.3')
    expect(byKey.data.value).toBe('[3 B]')
    expect(byKey.longs.value).toBe('[2 L]')
    expect(byKey.Items.type).toBe('list')
    expect(byKey.Items.children![0].children!.map((n) => n.value)).toEqual([
      '"minecraft:stone"',
      '64',
    ])
  })

  it('limits children, depth and string length', () => {
    const many: NbtCompound = new Map(Array.from({ length: 10 }, (_, i) => [`k${i}`, i]))
    const nested: NbtCompound = new Map([['a', new Map([['b', new Map([['c', 1]])]])]])
    expect(nbtTree(many, { maxDepth: 8, maxChildren: 3, maxString: 10 })).toHaveLength(3)
    const deep = nbtTree(nested, { maxDepth: 2, maxChildren: 10, maxString: 10 })
    expect(deep[0].children![0]).toMatchObject({ key: 'b', children: [], hidden: 1 })
    const long = nbtTree(new Map([['s', 'x'.repeat(50)]]), {
      maxDepth: 8,
      maxChildren: 10,
      maxString: 5,
    })
    expect(long[0].value).toBe('"xxxxx…"')
  })
})
