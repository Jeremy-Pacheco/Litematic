<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLButtonAttributes } from 'svelte/elements'

  interface Props extends HTMLButtonAttributes {
    variant?: 'primary' | 'secondary' | 'ghost'
    children: Snippet
  }

  let {
    variant = 'secondary',
    type = 'button',
    children,
    class: className,
    ...rest
  }: Props = $props()
</script>

<button {type} class={['btn', variant, className]} {...rest}>
  {@render children()}
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    height: 32px;
    padding: 0 var(--space-3);
    border: 1px solid transparent;
    border-radius: var(--radius);
    font-size: var(--text-md);
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background-color var(--duration),
      border-color var(--duration),
      color var(--duration);
  }

  .btn:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .primary {
    background: var(--color-primary);
    color: var(--color-on-primary);
  }

  .primary:not(:disabled):hover {
    background: var(--color-primary-hover);
  }

  .secondary {
    background: var(--color-panel);
    border-color: var(--color-border-strong);
    color: var(--color-text);
    font-weight: 500;
  }

  .secondary:not(:disabled):hover {
    background: var(--color-panel-hover);
  }

  .ghost {
    background: transparent;
    color: var(--color-text-2);
    font-weight: 500;
  }

  .ghost:not(:disabled):hover {
    background: var(--color-panel-hover);
    color: var(--color-text);
  }
</style>
