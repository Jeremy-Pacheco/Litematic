import type { BlockState } from '../types/structure'

export const AIR: BlockState = Object.freeze({
  name: 'minecraft:air',
  properties: Object.freeze({}),
})

/** Ids that are air for every purpose (rendering, counting materials). */
const AIR_IDS = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air'])

export function isAirId(name: string): boolean {
  return AIR_IDS.has(name)
}

/**
 * Canonical text form, `name[key=value,…]` with keys sorted. Two states with
 * the same key are the same block state.
 */
export function blockStateKey(state: BlockState): string {
  const keys = Object.keys(state.properties).sort()
  if (keys.length === 0) return state.name
  return `${state.name}[${keys.map((k) => `${k}=${state.properties[k]}`).join(',')}]`
}

/**
 * Builds a BlockState from untrusted name/property pairs. `Object.fromEntries`
 * defines own properties, so a key like `__proto__` stays data.
 */
export function createBlockState(name: string, properties: Iterable<[string, string]>): BlockState {
  return { name, properties: Object.fromEntries(properties) }
}
