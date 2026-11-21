import { readStorage, writeStorage } from '../utils/storage'

/** Item ids accepted from storage: `namespace:path`. */
const ITEM_ID = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/
const KEY_PREFIX = 'lv:materials:'

/** Identifies a file well enough to remember progress between visits. */
export function materialsStorageKey(file: { name: string; size: number; lastModified: number }) {
  return `${KEY_PREFIX}${file.name}|${file.size}|${file.lastModified}`
}

/**
 * Parses saved quantities, dropping anything malformed (storage is user
 * controlled). Returns a null-prototype object so ids are plain data.
 */
export function parseSavedQuantities(raw: string | null): Record<string, number> {
  const result: Record<string, number> = Object.create(null)
  if (!raw) return result
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return result
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return result
  for (const [item, value] of Object.entries(data)) {
    if (ITEM_ID.test(item) && Number.isInteger(value) && (value as number) > 0) {
      result[item] = value as number
    }
  }
  return result
}

/** Items still missing: never negative. */
export function missingCount(required: number, owned: number): number {
  return Math.max(0, required - owned)
}

/**
 * Quantities the user says they already have, per item, for the current file.
 * Entering them is optional: an item without a quantity counts as 0 owned.
 */
class MaterialProgress {
  owned = $state<Record<string, number>>({})
  #key: string | null = null

  /** Loads the saved quantities of a file. */
  open(key: string): void {
    this.#key = key
    // $state only proxies plain objects, so the null-prototype result is
    // copied. Keys were validated (they contain ':'), so none is __proto__.
    this.owned = { ...parseSavedQuantities(readStorage(key)) }
  }

  close(): void {
    this.#key = null
    this.owned = {}
  }

  get(item: string): number {
    return this.owned[item] ?? 0
  }

  /** Sets the owned quantity; 0 or invalid input clears it. */
  set(item: string, quantity: number): void {
    const value = Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0
    if (value > 0) this.owned[item] = value
    else delete this.owned[item]
    this.#save()
  }

  clear(): void {
    this.owned = {}
    this.#save()
  }

  #save(): void {
    if (this.#key) writeStorage(this.#key, JSON.stringify(this.owned))
  }
}

export const materialProgress = new MaterialProgress()
