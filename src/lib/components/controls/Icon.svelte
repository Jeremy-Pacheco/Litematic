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
    fit: ['M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4'],
    grid: ['M2 2h12v12H2z', 'M6 2v12M10 2v12M2 6h12M2 10h12'],
    box: ['M3 5.5 8 3l5 2.5v5L8 13l-5-2.5z', 'M3 5.5 8 8l5-2.5M8 8v5'],
    panel: [
      'M2 2.5h12a.5.5 0 0 1 .5.5v10a.5.5 0 0 1-.5.5H2a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5z',
      'M10 2.5v11',
    ],
    layers: ['M8 2 14 5 8 8 2 5z', 'M2 8l6 3 6-3', 'M2 11l6 3 6-3'],
    chevronUp: ['M4 10l4-4 4 4'],
    chevronDown: ['M4 6l4 4 4-4'],
    cookie: [
      'M8 1.5a6.5 6.5 0 1 0 6.5 6.5 2 2 0 0 1-2.2-2 2 2 0 0 1-2.3-2.3 2 2 0 0 1-2-2.2z',
      'M5.5 7h.01M8.5 10.5h.01M5.5 10.5h.01M10.5 8h.01',
    ],
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
