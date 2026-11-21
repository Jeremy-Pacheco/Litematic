import type { Structure } from '../types/structure'
import { blockToItems, type MaterialCategory } from './blockToItems'

export interface Material {
  /** Namespaced item id. */
  item: string
  /** Items needed to build the structure. */
  required: number
  category: MaterialCategory
}

export interface MaterialList {
  /** Survival-obtainable items, most needed first. */
  items: Material[]
  /** Fluid sources and survival-unobtainable blocks, shown apart. */
  special: Material[]
  /** Sum of `required` over `items`. */
  totalItems: number
}

/**
 * Builds the material list from the per-state counts of a structure. Cost is
 * proportional to the palette size, not to the number of blocks.
 */
export function buildMaterialList(
  structure: Pick<Structure, 'palette' | 'blockCounts'>,
): MaterialList {
  const totals = new Map<string, Material>()

  structure.palette.forEach((state, index) => {
    const placed = structure.blockCounts[index]
    if (!placed) return
    for (const { item, count, category } of blockToItems(state)) {
      const existing = totals.get(item)
      if (existing) existing.required += count * placed
      else totals.set(item, { item, required: count * placed, category })
    }
  })

  const byNeed = (a: Material, b: Material) =>
    b.required - a.required || a.item.localeCompare(b.item)
  const all = [...totals.values()]
  const items = all.filter((m) => m.category === 'item').sort(byNeed)
  const special = all.filter((m) => m.category !== 'item').sort(byNeed)
  return { items, special, totalItems: items.reduce((sum, m) => sum + m.required, 0) }
}

/**
 * Readable name from an item id until the official translated names are
 * available (they come with the game assets): `minecraft:oak_stairs` →
 * "Oak stairs". Other namespaces keep a prefix: "create: Cogwheel".
 */
export function itemDisplayName(item: string): string {
  const [namespace, path] = item.includes(':') ? item.split(':', 2) : ['minecraft', item]
  const words = path.replace(/[/_]+/g, ' ').trim()
  const name = words.charAt(0).toUpperCase() + words.slice(1)
  return namespace === 'minecraft' ? name : `${namespace}: ${name}`
}
