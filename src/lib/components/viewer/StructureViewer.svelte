<script lang="ts">
  import { onMount } from 'svelte'
  import { i18n } from '../../i18n/i18n.svelte'
  import type { ViewPreset } from '../../managers/CameraManager'
  import { SceneManager } from '../../managers/SceneManager'
  import {
    StructureManager,
    type ShowProgress,
    type ShowResult,
  } from '../../managers/StructureManager'
  import { assets } from '../../stores/assets.svelte'
  import { theme } from '../../stores/theme.svelte'
  import { toasts } from '../../stores/toasts.svelte'
  import { backgroundColor, viewer } from '../../stores/viewer.svelte'
  import type { Structure } from '../../types/structure'
  import { formatCount } from '../../utils/format'
  import Button from '../controls/Button.svelte'
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

  // (Re)build the 3D view when the structure or the game assets change.
  $effect(() => {
    if (scene && assetsReady) void load(structure)
  })

  $effect(() => {
    scene?.setHelpers({ grid: viewer.grid, box: viewer.box })
  })

  $effect(() => {
    scene?.setBackground(backgroundColor(viewer.background, theme.resolved))
  })

  const triangles = $derived(result ? result.stats.quads.reduce((a, b) => a + b, 0) * 2 : 0)
</script>

<div class="viewer">
  <div class="canvas" bind:this={container}></div>

  <div class="top">
    <ViewerToolbar
      onfit={() => scene?.cameras.fit()}
      onview={(view: ViewPreset) => scene?.cameras.setView(view)}
    />
  </div>

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
</style>
