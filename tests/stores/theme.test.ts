import { describe, expect, it } from 'vitest'
import { isThemePreference, resolveTheme } from '../../src/lib/stores/theme.svelte'

describe('resolveTheme', () => {
  it('follows the system in automatic mode', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('respects a manual choice regardless of the system', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})

describe('isThemePreference', () => {
  it('accepts the three modes', () => {
    expect(isThemePreference('system')).toBe(true)
    expect(isThemePreference('light')).toBe(true)
    expect(isThemePreference('dark')).toBe(true)
  })

  it('rejects anything else, including corrupted stored values', () => {
    expect(isThemePreference('Dark')).toBe(false)
    expect(isThemePreference('')).toBe(false)
    expect(isThemePreference(null)).toBe(false)
  })
})
