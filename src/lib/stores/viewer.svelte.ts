import { DEFAULT_BIOME, isBiomeId, type BiomeId } from '../models/biomes'
import { readStorage, writeStorage } from '../utils/storage'

export type ViewerBackground = 'theme' | 'dark' | 'light' | 'sky'

/** Which blocks the material list counts. */
export type MaterialScope = 'all' | 'layer' | 'visible'
export const MATERIAL_SCOPES: readonly MaterialScope[] = ['all', 'layer', 'visible']

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
  layersOpen: boolean
  materialScope: MaterialScope
  biome: BiomeId
}

const DEFAULTS: ViewerSettings = {
  grid: true,
  box: true,
  background: 'theme',
  panelOpen: true,
  layersOpen: true,
  materialScope: 'all',
  biome: DEFAULT_BIOME,
}

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
  return {
    grid: bool('grid'),
    box: bool('box'),
    panelOpen: bool('panelOpen'),
    layersOpen: bool('layersOpen'),
    background,
    materialScope: MATERIAL_SCOPES.includes(v.materialScope as MaterialScope)
      ? (v.materialScope as MaterialScope)
      : DEFAULTS.materialScope,
    biome: isBiomeId(v.biome) ? v.biome : DEFAULTS.biome,
  }
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
  layersOpen = $state(DEFAULTS.layersOpen)
  materialScope = $state<MaterialScope>(DEFAULTS.materialScope)
  biome = $state<BiomeId>(DEFAULTS.biome)

  init(): void {
    const raw = readStorage(STORAGE_KEY)
    const saved = parseViewerSettings(raw)
    // On a phone the layer panel would cover most of the view: closed until opened.
    if (!raw?.includes('"layersOpen"') && globalThis.matchMedia?.('(max-width: 720px)').matches) {
      saved.layersOpen = false
    }
    this.grid = saved.grid
    this.box = saved.box
    this.background = saved.background
    this.panelOpen = saved.panelOpen
    this.layersOpen = saved.layersOpen
    this.materialScope = saved.materialScope
    this.biome = saved.biome
  }

  save(): void {
    const settings: ViewerSettings = {
      grid: this.grid,
      box: this.box,
      background: this.background,
      panelOpen: this.panelOpen,
      layersOpen: this.layersOpen,
      materialScope: this.materialScope,
      biome: this.biome,
    }
    writeStorage(STORAGE_KEY, JSON.stringify(settings))
  }
}

export const viewer = new ViewerState()
