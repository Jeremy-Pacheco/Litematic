<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import { measurementId } from '../../analytics/googleAnalytics'
  import { consent } from '../../stores/consent.svelte'
  import { REPOSITORY_URL } from '../../constants/credits'
  import { STORAGE_KEYS } from '../../constants/storage'
  import { credits } from '../../stores/credits.svelte'
  import { importState } from '../../stores/importState.svelte'
  import { formatBytes } from '../../utils/format'
  import Icon from '../controls/Icon.svelte'
  import LanguageSwitcher from '../controls/LanguageSwitcher.svelte'
  import AssetsIndicator from './AssetsIndicator.svelte'
  import ThemeSwitcher from '../controls/ThemeSwitcher.svelte'

  const selected = $derived(importState.current)
  const dimensions = $derived.by(() => {
    const status = importState.status
    if (status.kind !== 'ready' || !status.info.dimensions) return null
    const { x, y, z } = status.info.dimensions
    return `${x}×${y}×${z}`
  })

  /** Star count shown next to the GitHub link; null hides it. */
  let stars = $state<number | null>(null)
  const starsLabel = $derived(
    stars === null
      ? null
      : new Intl.NumberFormat(i18n.locale, { notation: 'compact' }).format(stars),
  )

  // The last known count is shown instantly, then refreshed from GitHub on every
  // load. If the request fails (offline, or over the 60 requests/hour per IP the
  // unauthenticated API allows) the cached count simply stays.
  $effect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(STORAGE_KEYS.GITHUB_STARS) ?? 'null')
      if (typeof cached?.count === 'number') stars = cached.count
    } catch {
      // Storage unavailable or corrupt: fall through to the network.
    }

    const controller = new AbortController()
    const repo = new URL(REPOSITORY_URL).pathname
    fetch(`https://api.github.com/repos${repo}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (typeof data?.stargazers_count !== 'number') return
        stars = data.stargazers_count
        try {
          localStorage.setItem(
            STORAGE_KEYS.GITHUB_STARS,
            JSON.stringify({ count: stars, at: Date.now() }),
          )
        } catch {
          // Ignore: the count is just not cached.
        }
      })
      .catch(() => {
        // Offline or rate-limited: keep the cached count (or none).
      })
    return () => controller.abort()
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
    <AssetsIndicator />
    <a
      class="github"
      href={REPOSITORY_URL}
      target="_blank"
      rel="noopener noreferrer"
      title={i18n.t('app.github')}
      aria-label={i18n.t('app.github')}
    >
      <!-- GitHub mark: filled, so it lives here rather than in the stroke-only Icon set. -->
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"
        />
      </svg>
      <span class="github-star">
        <Icon name="star" size={13} class="star" />
        <span class="github-text">Star</span>
      </span>
      {#if starsLabel}
        <span class="github-count">{starsLabel}</span>
      {/if}
    </a>
    <button
      type="button"
      class="icon-button"
      title={i18n.t('credits.title')}
      aria-label={i18n.t('credits.title')}
      onclick={() => (credits.dialogOpen = true)}
    >
      <Icon name="info" size={15} />
    </button>
    {#if measurementId()}
      <button
        type="button"
        class="icon-button"
        title={i18n.t('cookies.title')}
        aria-label={i18n.t('cookies.title')}
        onclick={() => (consent.dialogOpen = true)}
      >
        <Icon name="cookie" size={15} />
      </button>
    {/if}
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

  .icon-button {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: transparent;
    color: var(--color-text-2);
    text-decoration: none;
    cursor: pointer;
  }

  .icon-button:hover {
    background: var(--color-panel-hover);
    color: var(--color-text);
  }

  .github {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: 28px;
    padding: 0 var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    color: var(--color-text-2);
    font-size: var(--text-xs);
    font-weight: 600;
    text-decoration: none;
    white-space: nowrap;
  }

  .github:hover {
    background: var(--color-panel-hover);
    color: var(--color-text);
  }

  .github-star {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .github-star :global(.star) {
    color: #e3b341;
  }

  .github-count {
    padding-left: var(--space-2);
    border-left: 1px solid var(--color-border);
    font-family: var(--font-mono);
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

    .meta,
    .github-star {
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
