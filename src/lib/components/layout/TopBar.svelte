<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import { importState } from '../../stores/importState.svelte'
  import { formatBytes } from '../../utils/format'
  import Icon from '../controls/Icon.svelte'
  import LanguageSwitcher from '../controls/LanguageSwitcher.svelte'
  import ThemeSwitcher from '../controls/ThemeSwitcher.svelte'

  const selected = $derived(importState.current)
  const dimensions = $derived.by(() => {
    const status = importState.status
    if (status.kind !== 'ready' || !status.info.dimensions) return null
    const { x, y, z } = status.info.dimensions
    return `${x}×${y}×${z}`
  })
</script>

<header class="topbar">
  <div class="brand">
    <Icon name="cube" size={18} class="logo" />
    <span class="brand-name">{i18n.t('app.name')}</span>
  </div>

  {#if selected}
    <p class="file" title={selected.file.name}>
      <span class="visually-hidden">{i18n.t('import.selected')}:</span>
      <span class="name">{selected.file.name}</span>
      <span class="meta">· {formatBytes(selected.file.size, 1, i18n.locale)}</span>
      {#if dimensions}
        <span class="meta">· {dimensions}</span>
      {/if}
    </p>
  {/if}

  <div class="tools">
    <LanguageSwitcher />
    <ThemeSwitcher />
  </div>
</header>

<style>
  .topbar {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    height: var(--topbar-height);
    padding: 0 var(--space-3);
    background: var(--color-panel);
    border-bottom: 1px solid var(--color-border);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
    font-weight: 600;
    white-space: nowrap;
  }

  .brand :global(.logo) {
    color: var(--color-primary);
  }

  .file {
    display: flex;
    gap: var(--space-1);
    min-width: 0;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-2);
    white-space: nowrap;
  }

  .name {
    /* Without min-width: 0 a flex item cannot shrink below its text width. */
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--color-text);
  }

  .meta {
    flex-shrink: 0;
  }

  .tools {
    display: flex;
    flex-shrink: 0;
    gap: var(--space-2);
    margin-left: auto;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (max-width: 520px) {
    .topbar {
      gap: var(--space-3);
    }

    .meta {
      display: none;
    }

    /* Keep the name for screen readers; the logo stays visible. */
    .brand-name {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
</style>
