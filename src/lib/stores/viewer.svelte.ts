import { readStorage, writeStorage } from '../utils/storage'

export type ViewerBackground = 'theme' | 'dark' | 'light' | 'sky'

/** Background colors; `theme` follows the app theme. */
export const BACKGROUND_COLORS: Readonly<Record<Exclude<ViewerBackground, 'theme'>, string>> = {
  dark: '#101214',
  light: '#e9ecef',
  sky: '#7ba4ff',
}
const THEME_BACKGROUND = { dark: '#15171a', light: '#e4e7eb' } as const

const STORAGE_KEY = 'lv:viewer'

interface ViewerSettings {
  grid: boolean
  box: boolean
  background: ViewerBackground
  panelOpen: boolean
}

const DEFAULTS: ViewerSettings = { grid: true, box: true, background: 'theme', panelOpen: true }

/** Parses saved settings, falling back to defaults for anything invalid. */
export function parseViewerSettings(raw: string | null): ViewerSettings {
  let data: unknown
  try {
    data = raw ? JSON.parse(raw) : null
  } catch {
    data = null
  }
  const v = (typeof data === 'object' && data !== null ? data : {}) as Partial<
    Record<string, unknown>
  >
  const bool = (key: keyof ViewerSettings) =>
    typeof v[key] === 'boolean' ? (v[key] as boolean) : (DEFAULTS[key] as boolean)
  const background = ['theme', 'dark', 'light', 'sky'].includes(v.background as string)
    ? (v.background as ViewerBackground)
    : DEFAULTS.background
  return { grid: bool('grid'), box: bool('box'), panelOpen: bool('panelOpen'), background }
}

/** Resolves the background setting to a color. */
export function backgroundColor(background: ViewerBackground, theme: 'light' | 'dark'): string {
  return background === 'theme' ? THEME_BACKGROUND[theme] : BACKGROUND_COLORS[background]
}

/** Viewer options shown in the toolbar, remembered between visits. */
class ViewerState {
  grid = $state(DEFAULTS.grid)
  box = $state(DEFAULTS.box)
  background = $state<ViewerBackground>(DEFAULTS.background)
  panelOpen = $state(DEFAULTS.panelOpen)

  init(): void {
    const saved = parseViewerSettings(readStorage(STORAGE_KEY))
    this.grid = saved.grid
    this.box = saved.box
    this.background = saved.background
    this.panelOpen = saved.panelOpen
  }

  save(): void {
    const settings: ViewerSettings = {
      grid: this.grid,
      box: this.box,
      background: this.background,
      panelOpen: this.panelOpen,
    }
    writeStorage(STORAGE_KEY, JSON.stringify(settings))
  }
}

export const viewer = new ViewerState()
