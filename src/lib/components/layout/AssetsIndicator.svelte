<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import { assets } from '../../stores/assets.svelte'
  import { resourcePack } from '../../stores/resourcePack.svelte'

  const status = $derived(assets.status)
  const label = $derived(
    status.kind === 'ready'
      ? i18n.t('assets.indicatorReady', { version: status.meta.version.id })
      : status.kind === 'loading'
        ? i18n.t('assets.indicatorLoading')
        : i18n.t('assets.indicatorNone'),
  )
</script>

{#if status.kind !== 'checking'}
  <button
    type="button"
    class="indicator"
    class:ready={status.kind === 'ready'}
    title={i18n.t('assets.title')}
    onclick={() => (assets.dialogOpen = true)}
  >
    <span class="dot" aria-hidden="true"></span>
    <span class="label">{label}</span>
    {#if resourcePack.active && status.kind === 'ready'}
      <span class="pack">{i18n.t('pack.indicator', { name: resourcePack.active.name })}</span>
    {/if}
  </button>
{/if}

<style>
  .indicator {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: 26px;
    padding: 0 var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: transparent;
    color: var(--color-text-2);
    font-size: var(--text-xs);
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
  }

  .indicator:hover {
    background: var(--color-panel-hover);
    color: var(--color-text);
  }

  .pack {
    max-width: 14em;
    overflow: hidden;
    padding-left: var(--space-2);
    border-left: 1px solid var(--color-border);
    text-overflow: ellipsis;
    font-weight: 500;
  }

  @media (max-width: 720px) {
    .pack {
      display: none;
    }
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--color-border-strong);
  }

  .ready .dot {
    background: var(--color-secondary);
  }

  /* Phones: only the status dot; the label stays for screen readers. */
  @media (max-width: 520px) {
    .label {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
</style>
