<script lang="ts">
  import { STRUCTURE_ACCEPT } from '../../constants/formats'
  import { i18n } from '../../i18n/i18n.svelte'
  import { openDroppedFiles } from '../../import/openAssetFiles'
  import { assets } from '../../stores/assets.svelte'
  import { importState } from '../../stores/importState.svelte'
  import DropZone from './DropZone.svelte'
  import ReadingProgress from './ReadingProgress.svelte'
  import WindowDropTarget from './WindowDropTarget.svelte'

  /**
   * Shown while no structure is open or one is being read. Once a structure
   * is ready the app switches to the 3D viewer.
   */
  let dragging = $state(false)

  const status = $derived(importState.status)
  const current = $derived(importState.current)
</script>

<WindowDropTarget bind:dragging onfiles={openDroppedFiles} />

<div class="screen">
  {#if status.kind === 'reading' && current}
    <ReadingProgress
      fileName={current.file.name}
      progress={status.progress}
      oncancel={() => importState.cancel()}
    />
  {:else}
    <DropZone accept={STRUCTURE_ACCEPT} {dragging} onfiles={openDroppedFiles} />
    {#if assets.status.kind === 'none'}
      <p class="assets-hint">
        {i18n.t('assets.hint')}
        <button type="button" class="link" onclick={() => (assets.dialogOpen = true)}>
          {i18n.t('assets.open')}
        </button>
      </p>
    {/if}
  {/if}
  <p class="note">{i18n.t('import.dropAssets')}</p>
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

  .assets-hint {
    max-width: 60ch;
    font-size: var(--text-sm);
    text-align: center;
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-primary);
    font-size: inherit;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }

  .note {
    max-width: 52ch;
    font-size: var(--text-sm);
    color: var(--color-text-2);
    text-align: center;
  }
</style>
