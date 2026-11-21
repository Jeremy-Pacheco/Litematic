<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import Button from '../controls/Button.svelte'
  import Icon from '../controls/Icon.svelte'

  interface Props {
    /** Value for the file input `accept` attribute (a hint, not a validation). */
    accept: string
    onfiles: (files: File[]) => void
  }

  let { accept, onfiles }: Props = $props()

  let input: HTMLInputElement | undefined = $state()

  // dragenter/dragleave fire for every child element, so a counter is used
  // instead of a boolean to know when the pointer really leaves the window.
  let dragDepth = $state(0)
  const dragging = $derived(dragDepth > 0)

  function carriesFiles(event: DragEvent): boolean {
    return event.dataTransfer?.types.includes('Files') ?? false
  }

  function onDragEnter(event: DragEvent): void {
    if (!carriesFiles(event)) return
    event.preventDefault()
    dragDepth++
  }

  function onDragOver(event: DragEvent): void {
    if (!carriesFiles(event)) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }

  function onDragLeave(event: DragEvent): void {
    if (!carriesFiles(event)) return
    dragDepth = Math.max(0, dragDepth - 1)
  }

  function onDrop(event: DragEvent): void {
    if (!carriesFiles(event)) return
    event.preventDefault()
    dragDepth = 0
    const files = Array.from(event.dataTransfer?.files ?? [])
    if (files.length > 0) onfiles(files)
  }

  function onInputChange(): void {
    if (!input) return
    const files = Array.from(input.files ?? [])
    input.value = '' // allow picking the same file again
    if (files.length > 0) onfiles(files)
  }
</script>

<svelte:window
  ondragenter={onDragEnter}
  ondragover={onDragOver}
  ondragleave={onDragLeave}
  ondrop={onDrop}
/>

<section class="dropzone" class:dragging aria-labelledby="dropzone-title">
  <span class="glyph"><Icon name="upload" size={22} /></span>
  <h1 id="dropzone-title">{i18n.t(dragging ? 'import.dropHere' : 'import.title')}</h1>
  <p class="formats">{i18n.t('import.formats')}</p>
  <Button variant="primary" onclick={() => input?.click()}>{i18n.t('import.open')}</Button>
  <input bind:this={input} type="file" {accept} hidden onchange={onInputChange} />
</section>

<!-- Window-wide highlight: files can be dropped anywhere, not only on the box. -->
{#if dragging}
  <div class="overlay" aria-hidden="true"></div>
{/if}

<style>
  .dropzone {
    display: grid;
    justify-items: center;
    gap: var(--space-2);
    width: min(520px, 100%);
    padding: var(--space-7) var(--space-5);
    background: var(--color-panel);
    border: 1.5px dashed var(--color-border-strong);
    border-radius: var(--radius-lg);
    text-align: center;
    transition:
      border-color var(--duration),
      background-color var(--duration);
  }

  .dropzone.dragging {
    border-color: var(--color-primary);
    background: var(--color-primary-soft);
  }

  .glyph {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    margin-bottom: var(--space-2);
    border-radius: var(--radius-lg);
    background: var(--color-primary-soft);
    color: var(--color-primary);
  }

  h1 {
    font-size: var(--text-xl);
    font-weight: 600;
    text-wrap: balance;
  }

  .formats {
    margin-bottom: var(--space-3);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--color-text-2);
  }

  .overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    outline: 2px dashed var(--color-primary);
    outline-offset: -12px;
    pointer-events: none;
  }
</style>
