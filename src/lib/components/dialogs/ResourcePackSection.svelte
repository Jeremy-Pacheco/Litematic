<script lang="ts">
  import { packCompatibility } from '../../assets/resourcePack'
  import { i18n } from '../../i18n/i18n.svelte'
  import { assets } from '../../stores/assets.svelte'
  import { resourcePack } from '../../stores/resourcePack.svelte'
  import { toasts } from '../../stores/toasts.svelte'
  import { formatBytes, formatCount } from '../../utils/format'
  import Button from '../controls/Button.svelte'
  import FilePickerButton from '../import/FilePickerButton.svelte'

  const status = $derived(resourcePack.status)
  const gameFormat = $derived(
    assets.status.kind === 'ready' ? assets.status.meta.version.resourcePackFormat : null,
  )
  const count = (value: number) => formatCount(value, i18n.locale)

  // Object URL of the pack icon, released when it changes or the section closes.
  let iconUrl = $state<string | null>(null)
  $effect(() => {
    const icon = status.kind === 'ready' ? status.meta.icon : null
    if (!icon) {
      iconUrl = null
      return
    }
    const url = URL.createObjectURL(new Blob([icon as BlobPart], { type: 'image/png' }))
    iconUrl = url
    return () => URL.revokeObjectURL(url)
  })

  async function onFiles(files: File[]): Promise<void> {
    const [file] = files
    if (!file) return
    const outcome = await resourcePack.importPack(file, gameFormat)
    if (outcome.kind === 'ready') {
      toasts.push({
        kind: 'success',
        title: { key: 'pack.readyTitle' },
        message: { key: 'pack.ready', params: { name: file.name } },
      })
      if (packCompatibility(outcome.meta.supported, gameFormat) === 'other-version') {
        toasts.push({
          kind: 'info',
          title: { key: 'pack.otherVersionTitle' },
          message: { key: 'pack.otherVersionMessage', params: { name: file.name } },
        })
      }
    } else if (outcome.code === 'not-zip') {
      toasts.push({
        kind: 'error',
        title: { key: 'pack.notZipTitle' },
        message: { key: 'pack.notZip', params: { name: file.name } },
      })
    } else {
      toasts.push({
        kind: outcome.code === 'cancelled' ? 'info' : 'error',
        title: { key: `assets.errors.${outcome.code}.title` },
        message: { key: `assets.errors.${outcome.code}.message`, params: { name: file.name } },
      })
    }
  }

  async function remove(): Promise<void> {
    await resourcePack.remove()
    toasts.push({ kind: 'info', title: { key: 'pack.removedTitle' } })
  }
</script>

<section class="pack" aria-labelledby="pack-title">
  <h3 id="pack-title">{i18n.t('pack.title')}</h3>
  <p class="hint">{i18n.t('pack.intro')}</p>

  {#if status.kind === 'ready'}
    {@const meta = status.meta}
    {@const compatibility = packCompatibility(meta.supported, gameFormat)}
    <div class="loaded">
      <div class="identity">
        {#if iconUrl}
          <img src={iconUrl} alt={i18n.t('pack.icon')} width="40" height="40" />
        {/if}
        <div class="names">
          <strong>{meta.name}</strong>
          {#if meta.description}
            <span class="description">{meta.description}</span>
          {/if}
        </div>
      </div>
      <dl>
        <dt>{i18n.t('pack.format')}</dt>
        <dd class="mono">{meta.packFormat ?? '—'}</dd>
        <dt>{i18n.t('pack.compatibility')}</dt>
        <dd class:warn={compatibility === 'other-version'}>
          {#if compatibility === 'compatible'}
            {i18n.t('pack.compatible')}
          {:else if compatibility === 'other-version' && meta.supported}
            {i18n.t('pack.otherVersion', {
              min: meta.supported.min,
              max: meta.supported.max,
              game: gameFormat ?? '—',
            })}
          {:else}
            {i18n.t('pack.unknown')}
          {/if}
        </dd>
        <dt>{i18n.t('pack.files')}</dt>
        <dd class="mono">
          {i18n.t('assets.filesValue', {
            count: count(meta.fileCount),
            size: formatBytes(meta.bytes, 1, i18n.locale),
          })}
        </dd>
        {#if meta.overlays.length > 0}
          <dt>{i18n.t('pack.overlays')}</dt>
          <dd class="mono">{meta.overlays.join(', ')}</dd>
        {/if}
        {#if meta.rejectedTextures.length > 0}
          <dt>{i18n.t('pack.rejected')}</dt>
          <dd title={meta.rejectedTextures.join('\n')}>
            {i18n.t('pack.rejectedValue', { count: count(meta.rejectedTextures.length) })}
          </dd>
        {/if}
      </dl>
      {#if meta.fileCount === 0}
        <p class="hint">{i18n.t('pack.noFiles')}</p>
      {/if}
      <div class="actions">
        <Button variant="ghost" onclick={remove}>{i18n.t('pack.remove')}</Button>
        <FilePickerButton
          label={i18n.t('pack.replace')}
          accept=".zip"
          variant="secondary"
          onfiles={onFiles}
        />
      </div>
    </div>
  {:else if status.kind === 'loading'}
    <div class="loading" role="status" aria-live="polite">
      <span class="spinner" aria-hidden="true"></span>
      <span>{i18n.t(`assets.phase.${status.phase}`)}</span>
      <Button variant="ghost" onclick={() => resourcePack.cancel()}>
        {i18n.t('import.cancel')}
      </Button>
    </div>
  {:else if assets.status.kind !== 'ready'}
    <p class="hint">{i18n.t('pack.needAssets')}</p>
  {:else}
    <div class="actions">
      <FilePickerButton
        label={i18n.t('pack.select')}
        accept=".zip"
        variant="secondary"
        onfiles={onFiles}
      />
    </div>
  {/if}
</section>

<style>
  .pack {
    display: grid;
    gap: var(--space-2);
  }

  h3 {
    font-size: var(--text-md);
    font-weight: 600;
  }

  .hint {
    font-size: var(--text-sm);
    color: var(--color-text-2);
  }

  .loaded {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-3);
    border-left: 2px solid var(--color-secondary);
    background: var(--color-secondary-soft);
  }

  .identity {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  img {
    flex: none;
    border-radius: var(--radius-sm);
    image-rendering: pixelated;
  }

  .names {
    display: grid;
    min-width: 0;
  }

  strong {
    overflow-wrap: anywhere;
  }

  .description {
    font-size: var(--text-sm);
    color: var(--color-text-2);
    overflow-wrap: anywhere;
  }

  dl {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: var(--space-1) var(--space-4);
    margin: 0;
  }

  dt {
    color: var(--color-text-2);
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .warn {
    color: var(--color-primary);
  }

  .mono {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .loading {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--color-border-strong);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation: none;
    }
  }
</style>
