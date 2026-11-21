import { STRUCTURE_EXTENSIONS } from '../constants/formats'
import { i18n } from '../i18n/i18n.svelte'
import { DEFAULT_MAX_DECOMPRESSED_BYTES } from '../parsers/nbt/decompress'
import { MAX_STRUCTURE_VOLUME } from '../parsers/structureBuilder'
import { importState } from '../stores/importState.svelte'
import { materialProgress, materialsStorageKey } from '../stores/materials.svelte'
import { toasts } from '../stores/toasts.svelte'
import { formatBytes, formatCount } from '../utils/format'
import { checkStructureFile } from '../utils/structureFile'

/**
 * Opens the files the user picked or dropped (import screen or viewer):
 * pre-checks them, reads the structure in its worker and reports the outcome
 * with toasts. Only one file at a time.
 */
export async function openStructureFiles(files: File[]): Promise<void> {
  if (files.length !== 1) {
    toasts.push({
      kind: 'error',
      title: { key: 'import.multipleTitle' },
      message: { key: 'import.multiple' },
    })
    return
  }

  const [file] = files
  const name = file.name
  const check = checkStructureFile(file)

  if (!check.ok) {
    const prefix = check.reason === 'empty' ? 'import.empty' : 'import.unsupported'
    toasts.push({
      kind: 'error',
      title: { key: `${prefix}Title` },
      message: { key: prefix, params: { name } },
    })
    return
  }

  const outcome = await importState.load(file, check.format)
  if (outcome.kind === 'superseded') return

  if (outcome.kind === 'error') {
    const params = {
      name,
      limit: formatBytes(DEFAULT_MAX_DECOMPRESSED_BYTES, 0, i18n.locale),
      maxBlocks: formatCount(MAX_STRUCTURE_VOLUME, i18n.locale),
      detail: outcome.message,
    }
    toasts.push({
      kind: outcome.code === 'cancelled' ? 'info' : 'error',
      title: { key: `import.errors.${outcome.code}.title` },
      message: { key: `import.errors.${outcome.code}.message`, params },
    })
    return
  }

  const { info } = outcome
  // Restore the quantities the user entered for this file in a past visit.
  materialProgress.open(materialsStorageKey(file))
  if (info.format !== check.format) {
    toasts.push({
      kind: 'info',
      title: { key: 'import.mismatchTitle' },
      message: {
        key: 'import.mismatch',
        params: {
          name,
          extension: STRUCTURE_EXTENSIONS[check.format],
          format: i18n.t(`format.${info.format}`),
        },
      },
    })
  }
  toasts.push({
    kind: 'success',
    title: { key: 'import.readyTitle' },
    message: { key: 'import.ready', params: { name, time: info.durationMs } },
  })
}
