<script lang="ts">
  import { STRUCTURE_ACCEPT } from '../../constants/formats'
  import { i18n } from '../../i18n/i18n.svelte'
  import { importState } from '../../stores/importState.svelte'
  import { toasts } from '../../stores/toasts.svelte'
  import { checkStructureFile } from '../../utils/structureFile'
  import DropZone from './DropZone.svelte'

  function handleFiles(files: File[]): void {
    if (files.length !== 1) {
      toasts.push({
        kind: 'error',
        title: { key: 'import.multipleTitle' },
        message: { key: 'import.multiple' },
      })
      return
    }

    const [file] = files
    const params = { name: file.name }
    const check = checkStructureFile(file)

    if (!check.ok) {
      const prefix = check.reason === 'empty' ? 'import.empty' : 'import.unsupported'
      toasts.push({
        kind: 'error',
        title: { key: `${prefix}Title` },
        message: { key: prefix, params },
      })
      return
    }

    importState.select(file, check.format)
    // Reading arrives in feature/nbt-reader; say so instead of pretending.
    toasts.push({
      kind: 'info',
      title: { key: 'import.notReadyTitle' },
      message: { key: 'import.notReady', params },
    })
  }
</script>

<div class="screen">
  <DropZone accept={STRUCTURE_ACCEPT} onfiles={handleFiles} />
  <p class="note">{i18n.t('import.localNote')}</p>
</div>

<style>
  .screen {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: var(--space-4);
    min-height: 100%;
    padding: var(--space-6) var(--space-4);
    /* Faint block grid, echoing the build plane of the 3D viewer. */
    background-image:
      linear-gradient(var(--color-grid) 1px, transparent 1px),
      linear-gradient(90deg, var(--color-grid) 1px, transparent 1px);
    background-size: var(--grid-size) var(--grid-size);
    background-position: center;
  }

  .note {
    max-width: 52ch;
    font-size: var(--text-sm);
    color: var(--color-text-2);
    text-align: center;
  }
</style>
