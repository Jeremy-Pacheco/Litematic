import {
  isNbtList,
  isNbtLongArray,
  type NbtCompound,
  type NbtList,
  type NbtLongArray,
  type NbtValue,
} from '../../types/nbt'

/**
 * Typed accessors for compounds. They return `undefined` when the key is
 * missing or holds a different type, so parsers can validate untrusted files
 * without casts.
 */

export function isCompound(value: NbtValue | undefined): value is NbtCompound {
  return value instanceof Map
}

export function getCompound(parent: NbtCompound, key: string): NbtCompound | undefined {
  const value = parent.get(key)
  return isCompound(value) ? value : undefined
}

/** Any integer or floating point scalar (byte, short, int, float, double). */
export function getNumber(parent: NbtCompound, key: string): number | undefined {
  const value = parent.get(key)
  return typeof value === 'number' ? value : undefined
}

export function getInteger(parent: NbtCompound, key: string): number | undefined {
  const value = getNumber(parent, key)
  return value !== undefined && Number.isInteger(value) ? value : undefined
}

export function getString(parent: NbtCompound, key: string): string | undefined {
  const value = parent.get(key)
  return typeof value === 'string' ? value : undefined
}

export function getList(parent: NbtCompound, key: string): NbtList | undefined {
  const value = parent.get(key)
  return isNbtList(value) ? value : undefined
}

export function getByteArray(parent: NbtCompound, key: string): Int8Array | undefined {
  const value = parent.get(key)
  return value instanceof Int8Array ? value : undefined
}

export function getIntArray(parent: NbtCompound, key: string): Int32Array | undefined {
  const value = parent.get(key)
  return value instanceof Int32Array ? value : undefined
}

export function getLongArray(parent: NbtCompound, key: string): NbtLongArray | undefined {
  const value = parent.get(key)
  return isNbtLongArray(value) ? value : undefined
}
