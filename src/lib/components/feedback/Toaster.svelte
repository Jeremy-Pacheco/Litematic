<script lang="ts">
  import { prefersReducedMotion } from 'svelte/motion'
  import { fly } from 'svelte/transition'
  import { i18n } from '../../i18n/i18n.svelte'
  import { toasts } from '../../stores/toasts.svelte'
  import Icon from '../controls/Icon.svelte'

  const duration = $derived(prefersReducedMotion.current ? 0 : 160)
</script>

<section class="toaster" aria-label={i18n.t('toast.region')} aria-live="polite">
  {#each toasts.items as toast (toast.id)}
    <div class="toast" data-kind={toast.kind} transition:fly={{ x: 16, duration }}>
      <span class="stripe" aria-hidden="true"></span>
      <div class="body">
        <p class="title">{i18n.t(toast.title.key, toast.title.params)}</p>
        {#if toast.message}
          <p class="message">{i18n.t(toast.message.key, toast.message.params)}</p>
        {/if}
      </div>
      <button
        type="button"
        class="close"
        aria-label={i18n.t('toast.close')}
        onclick={() => toasts.dismiss(toast.id)}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  {/each}
</section>

<style>
  .toaster {
    position: fixed;
    right: var(--space-4);
    bottom: var(--space-4);
    z-index: 100;
    display: grid;
    gap: var(--space-2);
    width: min(360px, calc(100vw - 2 * var(--space-4)));
    pointer-events: none;
  }

  .toast {
    display: grid;
    grid-template-columns: 3px minmax(0, 1fr) auto;
    gap: var(--space-3);
    padding: var(--space-3);
    background: var(--color-panel);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-pop);
    pointer-events: auto;
  }

  .stripe {
    border-radius: 2px;
    background: var(--color-text-2);
  }

  .toast[data-kind='success'] .stripe {
    background: var(--color-secondary);
  }

  .toast[data-kind='error'] .stripe {
    background: var(--color-error);
  }

  .toast[data-kind='error'] .title {
    color: var(--color-error);
  }

  .body {
    display: grid;
    gap: 2px;
  }

  .title {
    font-weight: 600;
  }

  .message {
    font-size: var(--text-sm);
    color: var(--color-text-2);
    overflow-wrap: anywhere;
  }

  .close {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
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
</style>
