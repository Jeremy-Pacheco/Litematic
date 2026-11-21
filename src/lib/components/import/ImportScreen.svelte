<script lang="ts">
  import { STRUCTURE_ACCEPT, STRUCTURE_EXTENSIONS } from '../../constants/formats'
  import { i18n } from '../../i18n/i18n.svelte'
  import { DEFAULT_MAX_DECOMPRESSED_BYTES } from '../../parsers/nbt/decompress'
  import { MAX_STRUCTURE_VOLUME } from '../../parsers/structureBuilder'
  import { importState } from '../../stores/importState.svelte'
  import { toasts } from '../../stores/toasts.svelte'
  import { formatBytes, formatCount } from '../../utils/format'
  import { checkStructureFile } from '../../utils/structureFile'
  import DropZone from './DropZone.svelte'
  import ReadingProgress from './ReadingProgress.svelte'
  import StructureSummary from './StructureSummary.svelte'
  import WindowDropTarget from './WindowDropTarget.svelte'

  let dragging = $state(false)

  const status = $derived(importState.status)
  const current = $derived(importState.current)

  async function handleFiles(files: File[]): Promise<void> {
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
</script>

<WindowDropTarget bind:dragging onfiles={handleFiles} />

<div class="screen">
  {#if status.kind === 'reading' && current}
    <ReadingProgress
      fileName={current.file.name}
      progress={status.progress}
      oncancel={() => importState.cancel()}
    />
  {:else if status.kind === 'ready' && current && !dragging}
    <StructureSummary
      fileName={current.file.name}
      info={status.info}
      structure={status.structure}
      accept={STRUCTURE_ACCEPT}
      onfiles={handleFiles}
    />
  {:else}
    <DropZone accept={STRUCTURE_ACCEPT} {dragging} onfiles={handleFiles} />
  {/if}
  <p class="note">{i18n.t('import.localNote')}</p>
</div>

<style>
  .screen {
    display: grid;
    /* A bounded column: with an auto-sized one, a long unbreakable file name
       would widen the panel past the screen on phones. */
    grid-template-columns: minmax(0, 520px);
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
