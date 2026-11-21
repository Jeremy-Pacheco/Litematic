<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import { layers } from '../../stores/layers.svelte'
  import { formatCount } from '../../utils/format'
  import {
    buildProgress,
    LAYER_MODES,
    layerStatus,
    type BuildDirection,
    type LayerMode,
    type LayerStatus,
  } from '../../viewer/layers'
  import Icon from '../controls/Icon.svelte'
  import SegmentedControl from '../controls/SegmentedControl.svelte'

  interface Props {
    /** Non-air blocks of each layer (index = y). */
    layerBlocks: Uint32Array
  }

  let { layerBlocks }: Props = $props()

  let list: HTMLOListElement | undefined = $state()

  const count = (n: number) => formatCount(n, i18n.locale)
  const height = $derived(layers.height)
  const progress = $derived(buildProgress(layerBlocks, layers.current, layers.direction))
  const percent = $derived(Math.round(progress.fraction * 100))
  /** Highest layer first, as they stack in the world. */
  const rows = $derived(Array.from({ length: height }, (_, i) => height - 1 - i))

  const MARKS: Record<LayerStatus, string> = { done: '✓', current: '●', pending: '○' }

  const directions = $derived([
    { value: 'up' as const, label: i18n.t('layers.directions.up'), text: '↑' },
    { value: 'down' as const, label: i18n.t('layers.directions.down'), text: '↓' },
  ])

  // Keep the current layer visible in the list (scrolling only the list, never the page).
  $effect(() => {
    const row = list?.querySelector<HTMLElement>(`[data-y="${layers.current}"]`)
    if (!list || !row) return
    const top = row.offsetTop
    const bottom = top + row.offsetHeight
    if (top < list.scrollTop) list.scrollTop = top
    else if (bottom > list.scrollTop + list.clientHeight)
      list.scrollTop = bottom - list.clientHeight
  })

  function isTyping(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && target.closest('input, select, textarea') !== null
  }

  /** PageUp / PageDown change layer anywhere in the viewer, as in a build session. */
  function onWindowKey(event: KeyboardEvent): void {
    if (event.defaultPrevented || isTyping(event.target)) return
    if (event.key === 'PageUp') layers.setCurrent(layers.current + 1)
    else if (event.key === 'PageDown') layers.setCurrent(layers.current - 1)
    else return
    event.preventDefault()
  }

  function onListKey(event: KeyboardEvent): void {
    const moves: Record<string, number> = {
      ArrowUp: layers.current + 1,
      ArrowDown: layers.current - 1,
      Home: height - 1,
      End: 0,
    }
    const target = moves[event.key]
    if (target === undefined) return
    event.preventDefault()
    layers.setCurrent(target)
    list?.querySelector<HTMLElement>(`[data-y="${layers.current}"]`)?.focus()
  }

  /** Applies a typed layer number (1-based) and shows the value actually used. */
  function onNumber(event: Event, apply: (y: number | null) => number): void {
    const input = event.currentTarget as HTMLInputElement
    const value = input.valueAsNumber
    input.value = String(apply(Number.isFinite(value) ? value - 1 : null) + 1)
  }

  // Each returns the layer in use, which may differ from the typed one (clamped).
  function setCurrent(y: number | null): number {
    if (y !== null) layers.setCurrent(y)
    return layers.current
  }

  function setFrom(y: number | null): number {
    if (y !== null) layers.setRange(y, layers.rangeMax)
    return layers.rangeMin
  }

  function setTo(y: number | null): number {
    if (y !== null) layers.setRange(layers.rangeMin, y)
    return layers.rangeMax
  }
</script>

<svelte:window onkeydown={onWindowKey} />

<section class="layers" aria-labelledby="layers-title">
  <header>
    <h2 id="layers-title">{i18n.t('layers.title')}</h2>
    <label class="mode">
      <span class="visually-hidden">{i18n.t('layers.mode')}</span>
      <select
        value={layers.mode}
        onchange={(e) => layers.setMode((e.currentTarget as HTMLSelectElement).value as LayerMode)}
      >
        {#each LAYER_MODES as mode (mode)}
          <option value={mode}>{i18n.t(`layers.modes.${mode}`)}</option>
        {/each}
      </select>
    </label>
  </header>

  <div class="stepper">
    <button
      type="button"
      class="step"
      title={i18n.t('layers.down')}
      aria-label={i18n.t('layers.down')}
      disabled={layers.current <= 0}
      onclick={() => layers.setCurrent(layers.current - 1)}
    >
      <Icon name="chevronDown" size={14} />
    </button>
    <label class="current">
      <span>{i18n.t('layers.layer')}</span>
      <input
        type="number"
        min="1"
        max={height}
        value={layers.current + 1}
        onchange={(e) => onNumber(e, setCurrent)}
      />
      <span class="of">/ {height}</span>
    </label>
    <button
      type="button"
      class="step"
      title={i18n.t('layers.up')}
      aria-label={i18n.t('layers.up')}
      disabled={layers.current >= height - 1}
      onclick={() => layers.setCurrent(layers.current + 1)}
    >
      <Icon name="chevronUp" size={14} />
    </button>
  </div>

  {#if layers.mode === 'range'}
    <div class="range">
      <label>
        <span>{i18n.t('layers.from')}</span>
        <input
          type="number"
          min="1"
          max={height}
          value={layers.rangeMin + 1}
          onchange={(e) => onNumber(e, setFrom)}
        />
      </label>
      <label>
        <span>{i18n.t('layers.to')}</span>
        <input
          type="number"
          min="1"
          max={height}
          value={layers.rangeMax + 1}
          onchange={(e) => onNumber(e, setTo)}
        />
      </label>
    </div>
  {/if}

  <div class="build">
    <span>{i18n.t('layers.direction')}</span>
    <SegmentedControl
      options={directions}
      value={layers.direction}
      label={i18n.t('layers.direction')}
      onchange={(d: BuildDirection) => layers.setDirection(d)}
    />
  </div>

  <div class="progress">
    <div class="progress-label">
      <span>
        {i18n.t('layers.progress', { done: progress.layersDone, total: progress.layers })}
      </span>
      <span class="mono">{percent} %</span>
    </div>
    <div
      class="track"
      role="progressbar"
      aria-label={i18n.t('layers.progressLabel')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <div class="fill" style:width="{percent}%"></div>
    </div>
  </div>

  <ol class="list" bind:this={list} aria-label={i18n.t('layers.list')}>
    {#each rows as y (y)}
      {@const status = layerStatus(y, layers.current, layers.direction)}
      <li>
        <button
          type="button"
          class="row {status}"
          data-y={y}
          aria-current={status === 'current' ? 'true' : undefined}
          tabindex={status === 'current' ? 0 : -1}
          onclick={() => layers.setCurrent(y)}
          onkeydown={onListKey}
        >
          <span class="mark" aria-hidden="true">{MARKS[status]}</span>
          <span class="visually-hidden">{i18n.t(`layers.status.${status}`)}:</span>
          <span class="name">{i18n.t('layers.layerN', { n: y + 1 })}</span>
          <span class="count mono">
            {layerBlocks[y] ? count(layerBlocks[y]) : i18n.t('layers.empty')}
          </span>
        </button>
      </li>
    {/each}
  </ol>

  <p class="hint">{i18n.t('layers.keys')}</p>
</section>

<style>
  .layers {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: 236px;
    max-height: 100%;
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--color-panel) 94%, transparent);
    box-shadow: var(--shadow-pop);
    font-size: var(--text-sm);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  h2 {
    margin: 0;
    font-size: var(--text-md);
    font-weight: 600;
  }

  select,
  input {
    height: 28px;
    padding: 0 var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-bg);
    color: var(--color-text);
    font: inherit;
  }

  select option {
    background: var(--color-panel);
  }

  input {
    width: 4.5em;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }

  .stepper {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .current {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .of {
    color: var(--color-text-2);
    font-family: var(--font-mono);
  }

  .step {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-panel);
    color: var(--color-text);
    cursor: pointer;
  }

  .step:hover:not(:disabled) {
    background: var(--color-panel-hover);
  }

  .step:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .range {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .range label,
  .build {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-1);
    color: var(--color-text-2);
  }

  .progress {
    display: grid;
    gap: var(--space-1);
  }

  .progress-label {
    display: flex;
    justify-content: space-between;
    color: var(--color-text-2);
  }

  .track {
    height: 6px;
    overflow: hidden;
    border-radius: 3px;
    background: var(--color-border);
  }

  .fill {
    height: 100%;
    background: var(--color-secondary);
    transition: width var(--duration) linear;
  }

  .list {
    position: relative;
    flex: 0 1 auto;
    min-height: 0;
    max-height: 320px;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    border-top: 1px solid var(--color-border);
    list-style: none;
  }

  .row {
    display: grid;
    grid-template-columns: 1.25em 1fr auto;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    height: 26px;
    padding: 0 var(--space-1);
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: var(--color-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .row:hover {
    background: var(--color-panel-hover);
  }

  .row.done {
    color: var(--color-text-2);
  }

  .row.done .mark {
    color: var(--color-secondary);
  }

  .row.current {
    background: var(--color-primary-soft);
    color: var(--color-primary);
    font-weight: 600;
  }

  .count {
    color: var(--color-text-2);
    font-size: var(--text-xs);
    font-weight: 400;
  }

  .mono {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }

  .hint {
    margin: 0;
    color: var(--color-text-2);
    font-size: var(--text-xs);
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (max-width: 720px) {
    .layers {
      width: 200px;
    }

    .list {
      max-height: 140px;
    }

    .hint {
      display: none;
    }
  }
</style>
