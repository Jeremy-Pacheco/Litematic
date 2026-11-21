import type { PackMeta } from '../assets/assetCache'
import { toAssetError, type AssetErrorCode } from '../assets/errors'
import type { AssetPhase } from '../assets/loadClientJar'
import { AssetManager, type AssetTask } from '../managers/AssetManager'

export type PackStatus =
  { kind: 'none' } | { kind: 'loading'; phase: AssetPhase } | { kind: 'ready'; meta: PackMeta }

export type PackImportOutcome =
  { kind: 'ready'; meta: PackMeta } | { kind: 'error'; code: AssetErrorCode; message: string }

/**
 * The user's resource pack (one at a time). The viewer rebuilds its textures
 * whenever `active` changes; the structure itself is not read again.
 */
class ResourcePackState {
  status = $state.raw<PackStatus>({ kind: 'none' })
  /**
   * Changes only when the cached pack changes (imported, removed, restored):
   * the viewer rebuilds on it, not on every loading phase.
   */
  revision = $state(0)

  #task: AssetTask<PackMeta> | null = null

  /** The pack in use, or `null` for the game's own textures. */
  get active(): PackMeta | null {
    return this.status.kind === 'ready' ? this.status.meta : null
  }

  /** Restores the cached pack at startup. Storage problems leave the app without one. */
  async init(): Promise<void> {
    try {
      const meta = await AssetManager.loadPack()
      if (meta) {
        this.status = { kind: 'ready', meta }
        this.revision++
      }
    } catch {
      // IndexedDB unavailable: continue with the game's textures.
    }
  }

  async importPack(file: File, gameFormat: number | null): Promise<PackImportOutcome> {
    this.#task?.cancel()
    const previous = this.status
    this.status = { kind: 'loading', phase: 'reading' }
    const task = AssetManager.importPack(file, gameFormat, (phase) => {
      if (this.#task === task) this.status = { kind: 'loading', phase }
    })
    this.#task = task
    try {
      const meta = await task.promise
      this.status = { kind: 'ready', meta }
      this.revision++
      return { kind: 'ready', meta }
    } catch (error) {
      const { code, message } = toAssetError(error)
      // A failed import keeps the previous pack (the cache was not touched).
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
    await AssetManager.removePack()
    this.status = { kind: 'none' }
    this.revision++
  }
}

export const resourcePack = new ResourcePackState()
