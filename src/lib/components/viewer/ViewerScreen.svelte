<script lang="ts">
  import { STRUCTURE_ACCEPT } from '../../constants/formats'
  import { openStructureFiles } from '../../import/openStructureFiles'
  import { buildMaterialList } from '../../materials/materialList'
  import { importState } from '../../stores/importState.svelte'
  import { viewer } from '../../stores/viewer.svelte'
  import type { StructureFileInfo } from '../../parsers/readStructureFile'
  import type { Structure } from '../../types/structure'
  import StructureSummary from '../import/StructureSummary.svelte'
  import ReadingProgress from '../import/ReadingProgress.svelte'
  import WindowDropTarget from '../import/WindowDropTarget.svelte'
  import MaterialList from '../materials/MaterialList.svelte'
  import StructureViewer from './StructureViewer.svelte'

  interface Props {
    fileName: string
    info: StructureFileInfo
    structure: Structure
  }

  let { fileName, info, structure }: Props = $props()

  let dragging = $state(false)
  const materials = $derived(buildMaterialList(structure))
</script>

<WindowDropTarget bind:dragging onfiles={openStructureFiles} />

<div class="screen" class:panel-open={viewer.panelOpen}>
  <section class="stage">
    <StructureViewer {structure} />
    <!-- Another file being read: the current structure stays on screen. -->
    {#if importState.status.kind === 'reading' && importState.current}
      <div class="reading">
        <ReadingProgress
          fileName={importState.current.file.name}
          progress={importState.status.progress}
          oncancel={() => importState.cancel()}
        />
      </div>
    {/if}
  </section>

  {#if viewer.panelOpen}
    <aside class="panel">
      <StructureSummary
        {fileName}
        {info}
        {structure}
        accept={STRUCTURE_ACCEPT}
        onfiles={openStructureFiles}
      />
      <MaterialList list={materials} />
    </aside>
  {/if}
</div>

<style>
  .screen {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    height: 100%;
    min-height: 0;
  }

  .screen.panel-open {
    grid-template-columns: minmax(0, 1fr) minmax(0, 440px);
  }

  .stage {
    position: relative;
    min-height: 0;
  }

  .reading {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: var(--space-4);
    background: color-mix(in srgb, var(--color-bg) 55%, transparent);
  }

  .reading > :global(*) {
    width: min(460px, 100%);
    box-shadow: var(--shadow-pop);
  }

  .panel {
    display: grid;
    align-content: start;
    gap: var(--space-3);
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-3);
    border-left: 1px solid var(--color-border);
    background: var(--color-bg);
  }

  .panel > :global(*) {
    width: 100%;
  }

  /* Narrow screens: viewer on top, panel below, page scrolls. */
  @media (max-width: 900px) {
    .screen,
    .screen.panel-open {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: 60vh auto;
      height: auto;
    }

    .panel {
      overflow: visible;
      border-left: 0;
      border-top: 1px solid var(--color-border);
    }
  }
</style>
