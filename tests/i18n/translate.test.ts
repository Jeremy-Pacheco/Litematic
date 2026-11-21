import { describe, expect, it } from 'vitest'
import { en } from '../../src/lib/i18n/locales/en'
import { es } from '../../src/lib/i18n/locales/es'
import { detectLocale, isLocale, translate } from '../../src/lib/i18n/translate'

/** Collects every dot-separated leaf path of a messages object. */
function leafPaths(node: object, prefix = ''): string[] {
  return Object.entries(node).flatMap(([key, value]) =>
    typeof value === 'string'
      ? [`${prefix}${key}`]
      : leafPaths(value as object, `${prefix}${key}.`),
  )
}

describe('locales', () => {
  it('es and en define exactly the same keys', () => {
    expect(leafPaths(en).sort()).toEqual(leafPaths(es).sort())
  })

  it('es and en use the same placeholders for each key', () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    for (const path of leafPaths(es)) {
      const esText = translate(es, path as never)
      const enText = translate(en, path as never)
      expect(placeholders(enText), path).toEqual(placeholders(esText))
    }
  })

  it('has no empty messages', () => {
    for (const path of leafPaths(es)) {
      expect(translate(es, path as never).trim(), `es ${path}`).not.toBe('')
      expect(translate(en, path as never).trim(), `en ${path}`).not.toBe('')
    }
  })
})

describe('translate', () => {
  it('resolves nested keys', () => {
    expect(translate(es, 'import.open')).toBe('Abrir archivo')
    expect(translate(en, 'import.open')).toBe('Open file')
  })

  it('fills placeholders', () => {
    expect(translate(en, 'import.empty', { name: 'house.schem' })).toBe(
      'house.schem contains no data.',
    )
  })

  it('leaves unknown placeholders visible', () => {
    expect(translate(en, 'import.empty', {})).toBe('{name} contains no data.')
  })

  it('returns the key when it does not resolve to a message', () => {
    expect(translate(en, 'import.nope' as never)).toBe('import.nope')
  })
})

describe('detectLocale', () => {
  it('matches on the primary language subtag', () => {
    expect(detectLocale(['es-MX', 'en-US'])).toBe('es')
    expect(detectLocale(['EN-gb'])).toBe('en')
  })

  it('uses the first supported language in order of preference', () => {
    expect(detectLocale(['fr-FR', 'en-US', 'es-ES'])).toBe('en')
  })

  it('falls back to English for unsupported languages', () => {
    expect(detectLocale(['fr-FR', 'de'])).toBe('en')
    expect(detectLocale([])).toBe('en')
  })
})

describe('isLocale', () => {
  it('accepts only supported locales', () => {
    expect(isLocale('es')).toBe(true)
    expect(isLocale('en')).toBe(true)
    expect(isLocale('fr')).toBe(false)
    expect(isLocale(null)).toBe(false)
  })
})
