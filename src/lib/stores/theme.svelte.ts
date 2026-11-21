import { STORAGE_KEYS } from '../constants/storage'
import { readStorage, writeStorage } from '../utils/storage'

/** What the user chose. `system` follows `prefers-color-scheme`. */
export type ThemePreference = 'system' | 'light' | 'dark'

/** The theme actually shown. */
export type ResolvedTheme = 'light' | 'dark'

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark']

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value)
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light'
  return preference
}

/**
 * Reactive theme state.
 *
 * Colors switch in CSS through `light-dark()` (see `styles/tokens.css`):
 * automatic mode needs no attribute, and a manual choice sets
 * `data-theme` on <html>. `resolved` is exposed for code that cannot use CSS,
 * such as the 3D viewer background.
 */
class ThemeStore {
  preference = $state<ThemePreference>('system')
  systemPrefersDark = $state(false)

  get resolved(): ResolvedTheme {
    return resolveTheme(this.preference, this.systemPrefersDark)
  }

  /** Loads the saved preference and starts following the system setting. */
  init(): void {
    const saved = readStorage(STORAGE_KEYS.THEME)
    if (isThemePreference(saved)) this.preference = saved

    const query = window.matchMedia('(prefers-color-scheme: dark)')
    this.systemPrefersDark = query.matches
    query.addEventListener('change', (event) => {
      this.systemPrefersDark = event.matches
    })

    this.#apply()
  }

  set(preference: ThemePreference): void {
    this.preference = preference
    writeStorage(STORAGE_KEYS.THEME, preference)
    this.#apply()
  }

  #apply(): void {
    const root = document.documentElement
    if (this.preference === 'system') delete root.dataset.theme
    else root.dataset.theme = this.preference
  }
}

export const theme = new ThemeStore()
