import type { BlockState } from '../types/structure'
import { createBlockState } from './blockState'

const DEFAULT_NAMESPACE = 'minecraft'
/** Resource location: `namespace:path`, lowercase, digits and `_ - . /`. */
const ID_PATTERN = /^(?:[a-z0-9_.-]+:)?[a-z0-9_./-]+$/
const PROPERTY_PATTERN = /^[a-z0-9_]+$/

/**
 * Parses a block state written as text, e.g.
 * `minecraft:oak_stairs[facing=north,half=bottom]` (the palette key format of
 * Sponge schematics). A missing namespace defaults to `minecraft`.
 *
 * Returns `null` when the text is not a valid block state.
 */
export function parseBlockStateString(text: string): BlockState | null {
  const open = text.indexOf('[')
  const rawId = (open === -1 ? text : text.slice(0, open)).trim()
  if (!ID_PATTERN.test(rawId)) return null
  const name = rawId.includes(':') ? rawId : `${DEFAULT_NAMESPACE}:${rawId}`

  if (open === -1) return createBlockState(name, [])
  if (!text.endsWith(']')) return null

  const body = text.slice(open + 1, -1).trim()
  if (body === '') return createBlockState(name, [])

  const pairs: [string, string][] = []
  for (const part of body.split(',')) {
    const eq = part.indexOf('=')
    if (eq === -1) return null
    const key = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (!PROPERTY_PATTERN.test(key) || value === '' || /[[\]=]/.test(value)) return null
    pairs.push([key, value])
  }
  return createBlockState(name, pairs)
}
