<script lang="ts" module>
  import type { IconName } from './Icon.svelte'

  export interface SegmentOption<T extends string> {
    value: T
    /** Accessible name, also shown as a tooltip. */
    label: string
    /** Short visible text (e.g. "ES"). Ignored when `icon` is set. */
    text?: string
    icon?: IconName
  }
</script>

<script lang="ts" generics="T extends string">
  import Icon from './Icon.svelte'

  interface Props {
    options: readonly SegmentOption<T>[]
    value: T
    /** Accessible name of the whole group. */
    label: string
    onchange: (value: T) => void
  }

  let { options, value, label, onchange }: Props = $props()
</script>

<div class="segmented" role="group" aria-label={label}>
  {#each options as option (option.value)}
    <button
      type="button"
      aria-pressed={option.value === value}
      aria-label={option.label}
      title={option.label}
      onclick={() => onchange(option.value)}
    >
      {#if option.icon}
        <Icon name={option.icon} size={14} />
      {:else}
        {option.text ?? option.label}
      {/if}
    </button>
  {/each}
</div>

<style>
  .segmented {
    display: inline-flex;
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    overflow: hidden;
  }

  button {
    display: grid;
    place-items: center;
    min-width: 28px;
    height: 26px;
    padding: 0 var(--space-2);
    border: 0;
    background: transparent;
    color: var(--color-text-2);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition:
      background-color var(--duration),
      color var(--duration);
  }

  button + button {
    border-left: 1px solid var(--color-border);
  }

  button:hover {
    background: var(--color-panel-hover);
    color: var(--color-text);
  }

  button[aria-pressed='true'] {
    background: var(--color-primary-soft);
    color: var(--color-primary);
  }

  button:focus-visible {
    outline-offset: -2px;
  }
</style>
