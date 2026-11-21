import {
  isNbtCompound,
  isNbtList,
  isNbtLongArray,
  longArrayLength,
  type NbtCompound,
  type NbtValue,
} from '../types/nbt'

/**
 * A read-only, size-limited view of NBT for the block inspector. Imported
 * data can be huge or deeply nested (a chest full of shulker boxes), so the
 * tree stops at a depth and a number of children per node, saying how much
 * was left out. Values are only ever shown as text, never interpreted.
 */

export interface NbtNode {
  key: string
  /** Short type label: `string`, `int`, `list`, `compound`… */
  type: string
  /** Text of a scalar or array value; absent for compounds and lists. */
  value?: string
  children?: NbtNode[]
  /** Children not shown because of the limits. */
  hidden?: number
}

export interface NbtTreeLimits {
  maxDepth: number
  maxChildren: number
  maxString: number
}

export const DEFAULT_LIMITS: NbtTreeLimits = { maxDepth: 8, maxChildren: 64, maxString: 200 }

export function nbtTree(root: NbtCompound, limits: NbtTreeLimits = DEFAULT_LIMITS): NbtNode[] {
  return children([...root], 0, limits)
}

function children(entries: [string, NbtValue][], depth: number, limits: NbtTreeLimits): NbtNode[] {
  return entries.slice(0, limits.maxChildren).map(([key, value]) => node(key, value, depth, limits))
}

function node(key: string, value: NbtValue, depth: number, limits: NbtTreeLimits): NbtNode {
  if (isNbtCompound(value) || isNbtList(value)) {
    const entries: [string, NbtValue][] = isNbtCompound(value)
      ? [...value]
      : value.items.map((item, i) => [String(i), item])
    const type = isNbtCompound(value) ? 'compound' : 'list'
    if (depth + 1 >= limits.maxDepth) return { key, type, children: [], hidden: entries.length }
    const shown = children(entries, depth + 1, limits)
    const hidden = entries.length - shown.length
    return hidden > 0 ? { key, type, children: shown, hidden } : { key, type, children: shown }
  }
  if (typeof value === 'string') {
    const text = value.length > limits.maxString ? `${value.slice(0, limits.maxString)}…` : value
    return { key, type: 'string', value: JSON.stringify(text) }
  }
  if (typeof value === 'bigint') return { key, type: 'long', value: `${value}L` }
  if (typeof value === 'number') return { key, type: 'number', value: formatNumber(value) }
  if (value instanceof Int8Array) return { key, type: 'byteArray', value: `[${value.length} B]` }
  if (value instanceof Int32Array) return { key, type: 'intArray', value: `[${value.length} I]` }
  if (isNbtLongArray(value)) {
    return { key, type: 'longArray', value: `[${longArrayLength(value)} L]` }
  }
  return { key, type: 'unknown', value: '?' }
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(6)))
}
