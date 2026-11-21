<script lang="ts">
  import ImportScreen from './lib/components/import/ImportScreen.svelte'
  import AppShell from './lib/components/layout/AppShell.svelte'
  import { importState } from './lib/stores/importState.svelte'

  // Once a structure is read, go straight to the 3D viewer.
  const status = $derived(importState.status)
  const current = $derived(importState.current)

  // The viewer (and Three.js) is loaded on demand, so the first screen stays
  // light; the download starts as soon as a structure is being read.
  let viewerModule: Promise<typeof import('./lib/components/viewer/ViewerScreen.svelte')> | null =
    null
  const loadViewer = () => (viewerModule ??= import('./lib/components/viewer/ViewerScreen.svelte'))

  $effect(() => {
    if (status.kind === 'reading') void loadViewer()
  })
</script>

<AppShell>
  {#if status.kind === 'ready' && status.structure && current}
    {#await loadViewer() then { default: ViewerScreen }}
      <ViewerScreen fileName={current.file.name} info={status.info} structure={status.structure} />
    {/await}
  {:else}
    <ImportScreen />
  {/if}
</AppShell>
