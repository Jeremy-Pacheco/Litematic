/**
 * Plain text of Minecraft text components (pack descriptions, sign lines).
 * Text is only extracted, never interpreted or inserted as HTML.
 */

/** Plain text of a description: a string or a text component (object or array). */
export function textOf(value: unknown, depth = 0): string {
  if (depth > 16) return ''
  let text = ''
  if (typeof value === 'string') text = value
  else if (typeof value === 'number' || typeof value === 'boolean') text = String(value)
  else if (Array.isArray(value)) text = value.map((part) => textOf(part, depth + 1)).join('')
  else if (typeof value === 'object' && value !== null) {
    const own = field(value, 'text') ?? field(value, 'translate') ?? ''
    const extra = field(value, 'extra')
    text = textOf(own, depth + 1) + (Array.isArray(extra) ? textOf(extra, depth + 1) : '')
  }
  // Remove legacy formatting codes (§a, §l…).
  return text.replace(/§./g, '').slice(0, 500)
}

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.hasOwn(value, key)
      ? (value as Record<string, unknown>)[key]
      : undefined
    : undefined
}
