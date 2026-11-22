import { packCompatibility } from '../assets/resourcePack'
import { assets } from '../stores/assets.svelte'
import { resourcePack } from '../stores/resourcePack.svelte'
import { toasts } from '../stores/toasts.svelte'
import { openStructureFiles } from './openStructureFiles'

/**
 * Imports of the game assets and resource packs with their notifications,
 * shared by the assets dialog and by files dropped on the window.
 */

export async function importClientJar(file: File): Promise<void> {
  const outcome = await assets.importJar(file)
  if (outcome.kind === 'ready') {
    toasts.push({
      kind: 'success',
      title: { key: 'assets.readyTitle' },
      message: { key: 'assets.ready', params: { version: outcome.meta.version.id } },
    })
    if (outcome.inMemory) pushMemoryNotice()
  } else {
    toasts.push({
      kind: outcome.code === 'cancelled' ? 'info' : 'error',
      title: { key: `assets.errors.${outcome.code}.title` },
      message: { key: `assets.errors.${outcome.code}.message`, params: { name: file.name } },
    })
  }
}

export async function importResourcePack(file: File): Promise<void> {
  if (assets.status.kind !== 'ready') {
    // The pack is laid over the game files: they are needed first.
    toasts.push({
      kind: 'info',
      title: { key: 'pack.title' },
      message: { key: 'pack.needAssets' },
    })
    return
  }
  const gameFormat = assets.status.meta.version.resourcePackFormat
  const outcome = await resourcePack.importPack(file, gameFormat)
  if (outcome.kind === 'ready') {
    toasts.push({
      kind: 'success',
      title: { key: 'pack.readyTitle' },
      message: { key: 'pack.ready', params: { name: file.name } },
    })
    if (outcome.inMemory) pushMemoryNotice()
    if (packCompatibility(outcome.meta.supported, gameFormat) === 'other-version') {
      toasts.push({
        kind: 'info',
        title: { key: 'pack.otherVersionTitle' },
        message: { key: 'pack.otherVersionMessage', params: { name: file.name } },
      })
    }
  } else if (outcome.code === 'not-zip') {
    toasts.push({
      kind: 'error',
      title: { key: 'pack.notZipTitle' },
      message: { key: 'pack.notZip', params: { name: file.name } },
    })
  } else {
    toasts.push({
      kind: outcome.code === 'cancelled' ? 'info' : 'error',
      title: { key: `assets.errors.${outcome.code}.title` },
      message: { key: `assets.errors.${outcome.code}.message`, params: { name: file.name } },
    })
  }
}

/** The browser refused to store the files: they work until the app is closed. */
function pushMemoryNotice(): void {
  toasts.push({
    kind: 'info',
    title: { key: 'assets.memoryTitle' },
    message: { key: 'assets.memory' },
  })
}

export type DroppedKind = 'jar' | 'pack' | 'structure'

/**
 * What a dropped file is meant to be, by its extension: `.jar` → the game
 * assets, `.zip` → a resource pack, anything else → a structure. The readers
 * still check the content; the extension only routes the file.
 */
export function droppedKind(name: string): DroppedKind {
  const lower = name.toLowerCase()
  if (lower.endsWith('.jar')) return 'jar'
  if (lower.endsWith('.zip')) return 'pack'
  return 'structure'
}

/** Opens files dropped on the window or picked, whatever they are. */
export async function openDroppedFiles(files: File[]): Promise<void> {
  if (files.length === 1) {
    const kind = droppedKind(files[0].name)
    if (kind === 'jar') return importClientJar(files[0])
    if (kind === 'pack') return importResourcePack(files[0])
  }
  return openStructureFiles(files)
}
