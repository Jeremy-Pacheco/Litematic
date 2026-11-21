import { es } from './locales/es'

/** Turns every string leaf of `T` into `string`, keeping the nesting. */
type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> }

/** Shape every locale must implement (derived from the Spanish messages). */
export type Messages = Widen<typeof es>

/** Dot-separated path to every string leaf, e.g. `'import.title'`. */
type LeafPaths<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : LeafPaths<T[K], `${Prefix}${K}.`>
}[keyof T & string]

export type MessageKey = LeafPaths<Messages>

export type MessageParams = Readonly<Record<string, string | number>>

export const LOCALES = ['es', 'en'] as const
export type Locale = (typeof LOCALES)[number]

/** Locale used when the browser prefers a language the app does not have. */
export const FALLBACK_LOCALE: Locale = 'en'

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/**
 * Picks the first supported locale from the browser's preferred languages
 * (`navigator.languages`), matching on the primary subtag: `es-MX` → `es`.
 */
export function detectLocale(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const primary = tag.toLowerCase().split('-')[0]
    if (isLocale(primary)) return primary
  }
  return FALLBACK_LOCALE
}

/**
 * Returns the message for `key`, replacing `{param}` placeholders.
 * Unknown placeholders are left as they are so missing data is visible.
 * If the key does not resolve to a string, the key itself is returned.
 */
export function translate(messages: Messages, key: MessageKey, params?: MessageParams): string {
  let node: unknown = messages
  for (const part of key.split('.')) {
    node =
      typeof node === 'object' && node !== null
        ? (node as Record<string, unknown>)[part]
        : undefined
  }

  if (typeof node !== 'string') {
    if (import.meta.env.DEV) console.warn(`[i18n] Missing message: ${key}`)
    return key
  }

  if (!params) return node
  return node.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}
