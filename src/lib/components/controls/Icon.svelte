<script lang="ts" module>
  /**
   * Hand-drawn 16×16 stroke icons. Kept intentionally small: add an icon here
   * only when a component needs it.
   */
  const ICONS = {
    sun: [
      'M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
      'M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06',
    ],
    moon: ['M13.5 9.6A5.5 5.5 0 0 1 6.4 2.5a5.5 5.5 0 1 0 7.1 7.1z'],
    monitor: [
      'M2.5 2.5h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z',
      'M5.5 14.5h5M8 11.5v3',
    ],
    upload: ['M8 10.5V2.5M4.5 6 8 2.5 11.5 6', 'M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2'],
    close: ['M4 4l8 8M12 4l-8 8'],
    cube: ['M8 1.5 14 5v6l-6 3.5L2 11V5z', 'M2 5l6 3.5L14 5M8 8.5v6'],
  } as const satisfies Record<string, readonly string[]>

  export type IconName = keyof typeof ICONS
</script>

<script lang="ts">
  interface Props {
    name: IconName
    size?: number
    class?: string
  }

  let { name, size = 16, class: className }: Props = $props()
</script>

<svg
  class={className}
  width={size}
  height={size}
  viewBox="0 0 16 16"
  fill="none"
  stroke="currentColor"
  stroke-width="1.5"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  {#each ICONS[name] as d (d)}
    <path {d} />
  {/each}
</svg>
