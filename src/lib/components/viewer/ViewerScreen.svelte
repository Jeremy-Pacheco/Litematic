<script lang="ts">
  import { STRUCTURE_ACCEPT } from '../../constants/formats'
  import { openDroppedFiles } from '../../import/openAssetFiles'
  import { openStructureFiles } from '../../import/openStructureFiles'
  import { i18n } from '../../i18n/i18n.svelte'
  import { LayerCounts } from '../../materials/layerCounts'
  import { buildMaterialList } from '../../materials/materialList'
  import { layers } from '../../stores/layers.svelte'
  import { importState } from '../../stores/importState.svelte'
  import { MATERIAL_SCOPES, viewer, type MaterialScope } from '../../stores/viewer.svelte'
  import SegmentedControl from '../controls/SegmentedControl.svelte'
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
  // Materials of the whole structure, the current layer or the visible layers.
  const layerCounts = $derived(new LayerCounts(structure))
  const scopeRange = $derived.by(() => {
    if (viewer.materialScope === 'layer') return { min: layers.current, max: layers.current }
    if (viewer.materialScope === 'visible' && layers.range) return layers.range
    return null
  })
  const materials = $derived(
    buildMaterialList({
      palette: structure.palette,
      blockCounts: scopeRange
        ? layerCounts.forRange(scopeRange.min, scopeRange.max)
        : structure.blockCounts,
    }),
  )
  const scopeOptions = $derived(
    MATERIAL_SCOPES.map((value) => ({
      value,
      label: i18n.t(`materials.scope.${value}`),
      text: i18n.t(`materials.scope.${value}`),
    })),
  )

  function setScope(value: MaterialScope): void {
    viewer.materialScope = value
    viewer.save()
  }
</script>

<WindowDropTarget bind:dragging onfiles={openDroppedFiles} />

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
      <MaterialList list={materials}>
        {#snippet scope()}
          <div class="scope">
            <SegmentedControl
              label={i18n.t('materials.scope.label')}
              value={viewer.materialScope}
              options={scopeOptions}
              onchange={setScope}
            />
            {#if scopeRange}
              <span class="range">
                {scopeRange.min === scopeRange.max
                  ? i18n.t('materials.scope.oneLayer', { n: scopeRange.min + 1 })
                  : i18n.t('materials.scope.layers', {
                      from: scopeRange.min + 1,
                      to: scopeRange.max + 1,
                    })}
              </span>
            {/if}
          </div>
        {/snippet}
      </MaterialList>
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

  .scope {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }

  .range {
    font-size: var(--text-sm);
    color: var(--color-text-2);
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
