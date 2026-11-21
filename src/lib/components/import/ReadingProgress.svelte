<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import type { ReadProgress } from '../../parsers/readStructureFile'
  import Button from '../controls/Button.svelte'

  interface Props {
    fileName: string
    progress: ReadProgress
    oncancel: () => void
  }

  let { fileName, progress, oncancel }: Props = $props()

  const percent = $derived(Math.round(progress.fraction * 100))
</script>

<section class="panel" aria-labelledby="reading-title" aria-busy="true">
  <h1 id="reading-title" class="title" title={fileName}>
    {i18n.t('import.reading', { name: fileName })}
  </h1>

  <div class="status">
    <span>{i18n.t(`phase.${progress.phase}`)}</span>
    <span class="percent">{percent} %</span>
  </div>
  <div
    class="track"
    role="progressbar"
    aria-label={i18n.t(`phase.${progress.phase}`)}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={percent}
  >
    <div class="fill" style:width="{percent}%"></div>
  </div>

  <div class="actions">
    <Button variant="secondary" onclick={oncancel}>{i18n.t('import.cancel')}</Button>
  </div>
</section>

<style>
  .panel {
    display: grid;
    gap: var(--space-3);
    width: min(520px, 100%);
    padding: var(--space-5);
    background: var(--color-panel);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  .title {
    overflow: hidden;
    font-size: var(--text-lg);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status {
    display: flex;
    justify-content: space-between;
    font-size: var(--text-sm);
    color: var(--color-text-2);
  }

  .percent {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--color-text);
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

  .actions {
    display: flex;
    justify-content: flex-end;
  }
</style>
