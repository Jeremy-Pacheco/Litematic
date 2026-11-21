<script lang="ts">
  /**
   * Makes the whole window a drop target for files and highlights it while a
   * file is dragged over it. Renders nothing else.
   */
  interface Props {
    onfiles: (files: File[]) => void
    /** True while files are dragged over the window. */
    dragging?: boolean
  }

  let { onfiles, dragging = $bindable(false) }: Props = $props()

  // dragenter/dragleave fire for every child element, so a counter is used
  // instead of a boolean to know when the pointer really leaves the window.
  let depth = 0

  function carriesFiles(event: DragEvent): boolean {
    return event.dataTransfer?.types.includes('Files') ?? false
  }

  function onDragEnter(event: DragEvent): void {
    if (!carriesFiles(event)) return
    event.preventDefault()
    depth++
    dragging = true
  }

  function onDragOver(event: DragEvent): void {
    if (!carriesFiles(event)) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }

  function onDragLeave(event: DragEvent): void {
    if (!carriesFiles(event)) return
    depth = Math.max(0, depth - 1)
    dragging = depth > 0
  }

  function onDrop(event: DragEvent): void {
    if (!carriesFiles(event)) return
    event.preventDefault()
    depth = 0
    dragging = false
    const files = Array.from(event.dataTransfer?.files ?? [])
    if (files.length > 0) onfiles(files)
  }
</script>

<svelte:window
  ondragenter={onDragEnter}
  ondragover={onDragOver}
  ondragleave={onDragLeave}
  ondrop={onDrop}
/>

{#if dragging}
  <div class="overlay" aria-hidden="true"></div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    outline: 2px dashed var(--color-primary);
    outline-offset: -12px;
    pointer-events: none;
  }
</style>
