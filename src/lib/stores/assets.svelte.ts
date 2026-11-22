import type { AssetsMeta, LangTable } from '../assets/assetCache'
import { toAssetError, type AssetErrorCode } from '../assets/errors'
import type { AssetPhase } from '../assets/loadClientJar'
import { AssetManager, type AssetLoadTask } from '../managers/AssetManager'

export type AssetsStatus =
  | { kind: 'checking' }
  | { kind: 'none' }
  | { kind: 'loading'; phase: AssetPhase }
  | { kind: 'ready'; meta: AssetsMeta }

export type AssetsImportOutcome =
  | { kind: 'ready'; meta: AssetsMeta; inMemory: boolean }
  | { kind: 'error'; code: AssetErrorCode; message: string }

/** Reactive state of the game assets for the UI. */
class AssetsState {
  status = $state.raw<AssetsStatus>({ kind: 'checking' })
  /** en_us translations, when assets are loaded. */
  lang = $state.raw<LangTable | null>(null)
  dialogOpen = $state(false)

  #task: AssetLoadTask | null = null

  /** Restores cached assets at startup. Storage problems leave the app without assets. */
  async init(): Promise<void> {
    try {
      const cached = await AssetManager.loadCached()
      if (cached) {
        this.lang = cached.lang
        this.status = { kind: 'ready', meta: cached.meta }
        return
      }
    } catch {
      // IndexedDB unavailable (private mode, blocked storage): continue without cache.
    }
    this.status = { kind: 'none' }
  }

  async importJar(file: File): Promise<AssetsImportOutcome> {
    this.#task?.cancel()
    const previous = this.status
    this.status = { kind: 'loading', phase: 'reading' }
    const task = AssetManager.importJar(file, (phase) => {
      if (this.#task === task) this.status = { kind: 'loading', phase }
    })
    this.#task = task
    try {
      const { meta, lang, inMemory } = await task.promise
      this.lang = lang
      this.status = { kind: 'ready', meta }
      return { kind: 'ready', meta, inMemory }
    } catch (error) {
      const { code, message } = toAssetError(error)
      this.status = previous.kind === 'ready' ? previous : { kind: 'none' }
      return { kind: 'error', code, message }
    } finally {
      if (this.#task === task) this.#task = null
    }
  }

  cancel(): void {
    this.#task?.cancel()
  }

  async remove(): Promise<void> {
    await AssetManager.remove()
    this.lang = null
    this.status = { kind: 'none' }
  }
}

export const assets = new AssetsState()
