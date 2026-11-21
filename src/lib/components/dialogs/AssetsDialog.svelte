<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import { assets } from '../../stores/assets.svelte'
  import { toasts } from '../../stores/toasts.svelte'
  import { formatBytes, formatCount } from '../../utils/format'
  import Button from '../controls/Button.svelte'
  import Icon from '../controls/Icon.svelte'
  import FilePickerButton from '../import/FilePickerButton.svelte'
  import ResourcePackSection from './ResourcePackSection.svelte'

  let dialog: HTMLDialogElement | undefined = $state()

  // The native <dialog> gives focus trapping, Escape to close and a backdrop.
  $effect(() => {
    if (!dialog) return
    if (assets.dialogOpen && !dialog.open) dialog.showModal()
    if (!assets.dialogOpen && dialog.open) dialog.close()
  })

  const status = $derived(assets.status)
  const count = (value: number) => formatCount(value, i18n.locale)

  async function onFiles(files: File[]): Promise<void> {
    const [file] = files
    if (!file) return
    const outcome = await assets.importJar(file)
    if (outcome.kind === 'ready') {
      toasts.push({
        kind: 'success',
        title: { key: 'assets.readyTitle' },
        message: { key: 'assets.ready', params: { version: outcome.meta.version.id } },
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
    await assets.remove()
    toasts.push({ kind: 'info', title: { key: 'assets.removedTitle' } })
  }
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="assets-title"
  onclose={() => (assets.dialogOpen = false)}
  onclick={(event) => {
    // A click on the backdrop targets the dialog element itself.
    if (event.target === dialog) assets.dialogOpen = false
  }}
>
  <div class="content">
    <header class="head">
      <h2 id="assets-title">{i18n.t('assets.title')}</h2>
      <button
        type="button"
        class="close"
        aria-label={i18n.t('assets.close')}
        onclick={() => (assets.dialogOpen = false)}
      >
        <Icon name="close" size={16} />
      </button>
    </header>

    <p class="intro">{i18n.t('assets.intro')}</p>

    {#if status.kind === 'ready'}
      <section class="loaded" aria-label={i18n.t('assets.loaded')}>
        <dl>
          <dt>{i18n.t('assets.version')}</dt>
          <dd class="mono">{status.meta.version.id}</dd>
          <dt>{i18n.t('summary.dataVersion')}</dt>
          <dd class="mono">{status.meta.version.dataVersion}</dd>
          <dt>{i18n.t('assets.files')}</dt>
          <dd class="mono">
            {i18n.t('assets.filesValue', {
              count: count(status.meta.fileCount),
              size: formatBytes(status.meta.bytes, 1, i18n.locale),
            })}
          </dd>
        </dl>
        <div class="actions">
          <Button variant="ghost" onclick={remove}>{i18n.t('assets.remove')}</Button>
          <FilePickerButton
            label={i18n.t('assets.replace')}
            accept=".jar"
            variant="secondary"
            onfiles={onFiles}
          />
        </div>
      </section>
    {:else if status.kind === 'loading'}
      <div class="loading" role="status" aria-live="polite">
        <span class="spinner" aria-hidden="true"></span>
        <span>{i18n.t(`assets.phase.${status.phase}`)}</span>
        <Button variant="ghost" onclick={() => assets.cancel()}>{i18n.t('import.cancel')}</Button>
      </div>
    {:else}
      <div class="actions">
        <FilePickerButton label={i18n.t('assets.select')} accept=".jar" onfiles={onFiles} />
      </div>
    {/if}

    <ResourcePackSection />

    <section class="where">
      <h3>{i18n.t('assets.whereTitle')}</h3>
      <dl class="paths">
        <dt>Windows</dt>
        <dd><code>%APPDATA%\.minecraft\versions\26.3\26.3.jar</code></dd>
        <dt>macOS</dt>
        <dd><code>~/Library/Application Support/minecraft/versions/26.3/26.3.jar</code></dd>
        <dt>Linux</dt>
        <dd><code>~/.minecraft/versions/26.3/26.3.jar</code></dd>
      </dl>
      <p class="hint">{i18n.t('assets.whereHint')}</p>
    </section>

    <p class="privacy">{i18n.t('assets.privacy')}</p>
  </div>
</dialog>

<style>
  dialog {
    width: min(560px, calc(100vw - 2 * var(--space-4)));
    max-height: calc(100vh - 2 * var(--space-6));
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-panel);
    color: var(--color-text);
    box-shadow: var(--shadow-pop);
  }

  dialog::backdrop {
    background: rgb(0 0 0 / 0.45);
  }

  .content {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5);
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  h2 {
    font-size: var(--text-lg);
    font-weight: 600;
  }

  h3 {
    margin-bottom: var(--space-2);
    font-size: var(--text-md);
    font-weight: 600;
  }

  .close {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-2);
    cursor: pointer;
  }

  .close:hover {
    background: var(--color-panel-hover);
    color: var(--color-text);
  }

  .intro,
  .hint,
  .privacy {
    font-size: var(--text-sm);
    color: var(--color-text-2);
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

  .mono,
  code {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
  }

  .loaded {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-3);
    border-left: 2px solid var(--color-secondary);
    background: var(--color-secondary-soft);
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

  .paths dt {
    font-size: var(--text-sm);
  }
</style>
