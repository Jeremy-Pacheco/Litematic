/**
 * localStorage keys used by the app. They are prefixed to avoid collisions
 * with other apps served from the same origin.
 *
 * `THEME` is also read by the inline script in `index.html` (to apply the
 * theme before the first paint); keep both in sync.
 */
export const STORAGE_KEYS = {
  THEME: 'lv:theme',
  LOCALE: 'lv:locale',
} as const
