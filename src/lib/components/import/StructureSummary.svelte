<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import type { StructureFileInfo } from '../../parsers/readStructureFile'
  import { formatBytes } from '../../utils/format'
  import FilePickerButton from './FilePickerButton.svelte'

  interface Props {
    fileName: string
    info: StructureFileInfo
    accept: string
    onfiles: (files: File[]) => void
  }

  let { fileName, info, accept, onfiles }: Props = $props()

  const size = (bytes: number) => formatBytes(bytes, 1, i18n.locale)
  const dimensions = $derived(
    info.dimensions
      ? `${info.dimensions.x} × ${info.dimensions.y} × ${info.dimensions.z}`
      : i18n.t('summary.unknown'),
  )
</script>

<section class="panel" aria-labelledby="summary-title">
  <h1 id="summary-title" class="title" title={fileName}>{fileName}</h1>

  <dl>
    <dt>{i18n.t('summary.format')}</dt>
    <dd>
      {i18n.t(`format.${info.format}`)}
      {#if info.formatVersion !== null}
        <span class="muted">
          {i18n.t('summary.formatVersion', { version: info.formatVersion })}
        </span>
      {/if}
    </dd>

    <dt>{i18n.t('summary.dimensions')}</dt>
    <dd class="mono">{dimensions}</dd>

    <dt>{i18n.t('summary.dataVersion')}</dt>
    <dd class="mono">{info.dataVersion ?? i18n.t('summary.unknown')}</dd>

    <dt>{i18n.t('summary.size')}</dt>
    <dd class="mono">
      {i18n.t('summary.sizeValue', {
        compressed: size(info.compressedBytes),
        decompressed: size(info.decompressedBytes),
      })}
    </dd>

    <dt>{i18n.t('summary.readTime')}</dt>
    <dd class="mono">{i18n.t('summary.readTimeValue', { time: info.durationMs })}</dd>
  </dl>

  <p class="pending">{i18n.t('import.blocksPending')}</p>

  <div class="actions">
    <FilePickerButton label={i18n.t('import.openAnother')} {accept} variant="secondary" {onfiles} />
  </div>
</section>

<style>
  .panel {
    display: grid;
    gap: var(--space-4);
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

  dl {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: var(--space-2) var(--space-5);
    margin: 0;
  }

  dt {
    color: var(--color-text-2);
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .mono {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }

  .muted {
    margin-left: var(--space-1);
    color: var(--color-text-2);
  }

  .pending {
    padding: var(--space-2) var(--space-3);
    border-left: 2px solid var(--color-secondary);
    background: var(--color-secondary-soft);
    font-size: var(--text-sm);
    color: var(--color-text);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
  }
</style>
