<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import type { StructureFileInfo } from '../../parsers/readStructureFile'
  import type { Structure } from '../../types/structure'
  import { formatBytes, formatCount } from '../../utils/format'
  import FilePickerButton from './FilePickerButton.svelte'

  interface Props {
    fileName: string
    info: StructureFileInfo
    /** `null` when the blocks of this format are not parsed yet. */
    structure: Structure | null
    accept: string
    onfiles: (files: File[]) => void
  }

  let { fileName, info, structure, accept, onfiles }: Props = $props()

  const size = (bytes: number) => formatBytes(bytes, 1, i18n.locale)
  const count = (value: number) => formatCount(value, i18n.locale)

  const title = $derived(structure?.metadata.name || fileName)
  const dimensions = $derived(
    info.dimensions
      ? `${info.dimensions.x} × ${info.dimensions.y} × ${info.dimensions.z}`
      : i18n.t('summary.unknown'),
  )

  const warnings = $derived.by(() => {
    if (!structure) return []
    const w = structure.warnings
    const list: string[] = []
    if (w.legacyBlockNames) list.push(i18n.t('warnings.legacy'))
    if (w.invalidPaletteIndices > 0)
      list.push(i18n.t('warnings.invalidIndices', { count: count(w.invalidPaletteIndices) }))
    if (w.overlappingBlocks > 0)
      list.push(i18n.t('warnings.overlap', { count: count(w.overlappingBlocks) }))
    if (w.skippedObjects > 0)
      list.push(i18n.t('warnings.skipped', { count: count(w.skippedObjects) }))
    return list
  })
</script>

<section class="panel" aria-labelledby="summary-title">
  <header class="head">
    <h1 id="summary-title" class="title" {title}>{title}</h1>
    {#if structure?.metadata.name && structure.metadata.name !== fileName}
      <p class="file" title={fileName}>{fileName}</p>
    {/if}
    {#if structure?.metadata.description}
      <p class="description">{structure.metadata.description}</p>
    {/if}
  </header>

  <dl>
    {#if structure?.metadata.author}
      <dt>{i18n.t('summary.author')}</dt>
      <dd>{structure.metadata.author}</dd>
    {/if}

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

    {#if structure}
      <dt>{i18n.t('summary.blocks')}</dt>
      <dd class="mono">{count(structure.nonAirBlocks)}</dd>

      <dt>{i18n.t('summary.states')}</dt>
      <dd class="mono">{count(structure.palette.length - 1)}</dd>

      <dt>{i18n.t('summary.regions')}</dt>
      <dd class="mono">{count(structure.regions.length)}</dd>

      <dt>{i18n.t('summary.objects')}</dt>
      <dd class="mono">
        {i18n.t('summary.objectsValue', {
          blockEntities: count(structure.blockEntities.length),
          entities: count(structure.entities.length),
        })}
      </dd>
    {/if}

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

  {#if warnings.length > 0}
    <ul class="warnings">
      {#each warnings as warning (warning)}
        <li>{warning}</li>
      {/each}
    </ul>
  {/if}

  <p class="pending">
    {i18n.t(structure ? 'import.viewerPending' : 'import.blocksPending')}
  </p>

  <div class="actions">
    <FilePickerButton label={i18n.t('import.openAnother')} {accept} variant="secondary" {onfiles} />
  </div>
</section>

<style>
  .panel {
    display: grid;
    /* minmax(0, …) lets long file names shrink with an ellipsis instead of
       widening the panel to their full length. */
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-4);
    width: min(520px, 100%);
    padding: var(--space-5);
    background: var(--color-panel);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  .head {
    display: grid;
    gap: var(--space-1);
    min-width: 0;
  }

  .title,
  .file {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .title {
    font-size: var(--text-lg);
    font-weight: 600;
  }

  .file {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-2);
  }

  .description {
    display: -webkit-box;
    margin-top: var(--space-1);
    overflow: hidden;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    font-size: var(--text-sm);
    color: var(--color-text-2);
    overflow-wrap: anywhere;
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

  .warnings {
    display: grid;
    gap: var(--space-1);
    margin: 0;
    padding: var(--space-2) var(--space-3) var(--space-2) var(--space-6);
    border-left: 2px solid var(--color-primary);
    background: var(--color-primary-soft);
    font-size: var(--text-sm);
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
