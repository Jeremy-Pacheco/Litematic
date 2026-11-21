<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { i18n } from '../../i18n/i18n.svelte'
  import type { ViewPreset } from '../../managers/CameraManager'
  import { SceneManager } from '../../managers/SceneManager'
  import {
    StructureManager,
    type ShowProgress,
    type ShowResult,
  } from '../../managers/StructureManager'
  import { assets } from '../../stores/assets.svelte'
  import { layers } from '../../stores/layers.svelte'
  import { resourcePack } from '../../stores/resourcePack.svelte'
  import { theme } from '../../stores/theme.svelte'
  import { toasts } from '../../stores/toasts.svelte'
  import { backgroundColor, viewer } from '../../stores/viewer.svelte'
  import { blockIndex, type BlockEntity, type Structure, type Vec3 } from '../../types/structure'
  import { formatCount } from '../../utils/format'
  import { pickBlock } from '../../viewer/picking'
  import Button from '../controls/Button.svelte'
  import LayerPanel from '../layers/LayerPanel.svelte'
  import BlockInspector from './BlockInspector.svelte'
  import ViewerToolbar from './ViewerToolbar.svelte'

  interface Props {
    structure: Structure
  }

  let { structure }: Props = $props()

  let container: HTMLDivElement | undefined = $state()
  let scene: SceneManager | null = $state.raw(null)
  let manager: StructureManager | null = null
  let progress = $state.raw<ShowProgress | null>(null)
  let result = $state.raw<ShowResult | null>(null)
  let failed = $state(false)
  let selected = $state.raw<Vec3 | null>(null)
  /** Where the pointer went down: a click only if it did not move (not an orbit drag). */
  let pressed: { id: number; x: number; y: number } | null = null

  const assetsReady = $derived(assets.status.kind === 'ready')
  const count = (n: number) => formatCount(n, i18n.locale)

  onMount(() => {
    if (!container) return
    const created = new SceneManager(container)
    manager = new StructureManager(created)
    created.onContextRestored = () => void load(structure)
    scene = created
    // Development only: lets automated checks read renderer statistics.
    if (import.meta.env.DEV) (globalThis as Record<string, unknown>).__lvScene = created
    return () => {
      manager?.clear()
      created.dispose()
      scene = null
      manager = null
    }
  })

  async function load(target: Structure): Promise<void> {
    if (!manager) return
    failed = false
    result = null
    progress = { phase: 'models', fraction: 0 }
    try {
      const shown = await manager.show(target, (p) => (progress = p))
      if (target !== structure) return
      result = shown
      if (shown.textureScale > 1) {
        toasts.push({
          kind: 'info',
          title: { key: 'pack.reducedTitle' },
          message: { key: 'pack.reduced', params: { scale: shown.textureScale } },
        })
      }
      if (shown.missingBlocks.length > 0) {
        toasts.push({
          kind: 'info',
          title: { key: 'viewer.missingTitle' },
          message: { key: 'viewer.missing', params: { count: shown.missingBlocks.length } },
        })
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      failed = true
      toasts.push({
        kind: 'error',
        title: { key: 'viewer.errorTitle' },
        message: { key: 'viewer.error' },
      })
    } finally {
      if (target === structure) progress = null
    }
  }

  // A new structure starts its layer selection over (before it is shown).
  $effect(() => {
    const height = structure.size.y
    untrack(() => {
      layers.reset(height)
      selected = null
    })
  })

  // (Re)build the 3D view when the structure, the game assets or the resource
  // pack change. A new pack rebuilds textures and geometry, not the structure.
  $effect(() => {
    void resourcePack.revision
    if (scene && assetsReady) void load(structure)
  })

  $effect(() => {
    scene?.setHelpers({ grid: viewer.grid, box: viewer.box })
  })

  // Layers: cut the structure (cheap, no rebuild) and outline the current one.
  $effect(() => {
    const range = layers.range
    if (scene) manager?.setLayerRange(range)
  })

  $effect(() => {
    scene?.setLayerMarker(viewer.layersOpen ? layers.current : null)
  })

  $effect(() => {
    scene?.setBackground(backgroundColor(viewer.background, theme.resolved))
  })

  $effect(() => {
    scene?.setSelection(selected)
  })

  /** Block entities by position, to show the data of the selected block. */
  const blockEntities = $derived(
    new Map<number, BlockEntity>(
      structure.blockEntities.map((e) => [
        blockIndex(structure.size, e.pos.x, e.pos.y, e.pos.z),
        e,
      ]),
    ),
  )
  const selectedEntity = $derived(
    selected
      ? (blockEntities.get(blockIndex(structure.size, selected.x, selected.y, selected.z)) ?? null)
      : null,
  )

  function onPointerDown(event: PointerEvent): void {
    pressed =
      event.button === 0 ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null
  }

  function onPointerUp(event: PointerEvent): void {
    const start = pressed
    pressed = null
    if (!scene || !start || start.id !== event.pointerId) return
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_TOLERANCE) return
    const { size, blocks } = structure
    // Picks on the block array: works before the meshes finish and respects hidden layers.
    selected = pickBlock(scene.rayAt(event.clientX, event.clientY), {
      size,
      range: layers.range,
      isSolid: (x, y, z) => blocks[blockIndex(size, x, y, z)] !== 0,
    })
  }

  function onKey(event: KeyboardEvent): void {
    const typing =
      event.target instanceof HTMLElement && event.target.closest('input, select, textarea')
    if (event.key === 'Escape' && selected && !typing) selected = null
  }

  const CLICK_TOLERANCE = 5

  const triangles = $derived(result ? result.stats.quads.reduce((a, b) => a + b, 0) * 2 : 0)
</script>

<svelte:window onkeydown={onKey} />

<div class="viewer" class:inspecting={selected !== null}>
  <div
    class="canvas"
    role="application"
    aria-label={i18n.t('viewer.canvas')}
    bind:this={container}
    onpointerdown={onPointerDown}
    onpointerup={onPointerUp}
    onpointercancel={() => (pressed = null)}
  ></div>

  <div class="top">
    <ViewerToolbar
      onfit={() => scene?.cameras.fit()}
      onview={(view: ViewPreset) => scene?.cameras.setView(view)}
    />
  </div>

  {#if viewer.layersOpen && structure.size.y > 0}
    <div class="side">
      <LayerPanel layerBlocks={structure.layerBlocks} />
    </div>
  {/if}

  {#if selected}
    <div class="inspect">
      <BlockInspector
        {structure}
        pos={selected}
        blockEntity={selectedEntity}
        onclose={() => (selected = null)}
      />
    </div>
  {/if}

  {#if !assetsReady}
    <div class="notice" role="status">
      <p>{i18n.t('viewer.needAssets')}</p>
      <Button variant="primary" onclick={() => (assets.dialogOpen = true)}>
        {i18n.t('assets.open')}
      </Button>
    </div>
  {:else if failed}
    <div class="notice" role="alert">
      <p>{i18n.t('viewer.error')}</p>
      <Button variant="secondary" onclick={() => load(structure)}>{i18n.t('viewer.retry')}</Button>
    </div>
  {/if}

  <div class="bottom">
    <span class="mono">
      {structure.size.x} × {structure.size.y} × {structure.size.z} · {i18n.t('viewer.blocks', {
        count: count(structure.nonAirBlocks),
      })}
    </span>
    {#if progress}
      <span class="progress" role="status">
        {i18n.t(`viewer.phase.${progress.phase}`)}
        <span class="mono">{Math.round(progress.fraction * 100)} %</span>
      </span>
    {:else if result}
      <span class="mono stats">
        {i18n.t('viewer.stats', {
          sections: count(result.stats.sections),
          triangles: count(triangles),
          time: result.bakeMs + result.stats.durationMs,
        })}
      </span>
      {#if !selected}
        <span class="hint">{i18n.t('inspector.hint')}</span>
      {/if}
    {/if}
  </div>
</div>

<style>
  .viewer {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .canvas {
    position: absolute;
    inset: 0;
    touch-action: none;
  }

  .canvas :global(canvas) {
    display: block;
    outline: none;
  }

  .top {
    position: absolute;
    top: var(--space-3);
    left: var(--space-3);
    right: var(--space-3);
    pointer-events: none;
  }

  .top > :global(*) {
    pointer-events: auto;
  }

  .side {
    position: absolute;
    top: calc(var(--space-3) + 42px);
    right: var(--space-3);
    bottom: calc(var(--space-3) + 34px);
    display: flex;
    align-items: flex-start;
    pointer-events: none;
  }

  .inspect {
    position: absolute;
    top: calc(var(--space-3) + 42px);
    left: var(--space-3);
    bottom: calc(var(--space-3) + 34px);
    display: flex;
    align-items: flex-start;
    pointer-events: none;
  }

  .inspect > :global(*),
  .side > :global(*) {
    pointer-events: auto;
  }

  .bottom {
    position: absolute;
    left: var(--space-3);
    bottom: var(--space-3);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-4);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--color-panel) 85%, transparent);
    font-size: var(--text-xs);
    color: var(--color-text-2);
    pointer-events: none;
  }

  .mono {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }

  .progress {
    color: var(--color-text);
  }

  .notice {
    position: absolute;
    top: 50%;
    left: 50%;
    display: grid;
    justify-items: center;
    gap: var(--space-3);
    width: min(380px, calc(100% - 2 * var(--space-4)));
    padding: var(--space-5);
    transform: translate(-50%, -50%);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-panel);
    box-shadow: var(--shadow-pop);
    text-align: center;
  }

  .hint {
    color: var(--color-text-2);
  }

  /* Narrow screens: the toolbar takes two rows. */
  @media (max-width: 720px) {
    .side,
    .inspect {
      top: calc(var(--space-3) + 80px);
    }

    .inspect {
      right: var(--space-3);
    }

    /* Only one floating panel fits: the inspector covers the layers while open. */
    .inspecting .side {
      display: none;
    }

    .hint {
      display: none;
    }
  }
</style>
