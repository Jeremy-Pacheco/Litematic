<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import { itemDisplayName, type Material } from '../../materials/materialList'
  import { stackBreakdown, stackSize } from '../../materials/stackSizes'
  import { assets } from '../../stores/assets.svelte'
  import { materialProgress, missingCount } from '../../stores/materials.svelte'
  import { formatCount } from '../../utils/format'

  interface Props {
    material: Material
  }

  let { material }: Props = $props()

  const count = (value: number) => formatCount(value, i18n.locale)
  const name = $derived(itemDisplayName(material.item, assets.lang))
  const owned = $derived(materialProgress.get(material.item))
  const missing = $derived(missingCount(material.required, owned))

  const stacks = $derived.by(() => {
    const size = stackSize(material.item)
    const { stacks, remainder, shulkerBoxes } = stackBreakdown(material.required, size)
    if (stacks === 0) return { text: count(remainder), shulkers: null }
    const text =
      remainder === 0
        ? i18n.t('materials.stacksOnly', { stacks: count(stacks), size })
        : i18n.t('materials.stacksValue', { stacks: count(stacks), size, rest: count(remainder) })
    const shulkers =
      shulkerBoxes >= 1
        ? i18n.t('materials.shulkers', {
            boxes: new Intl.NumberFormat(i18n.locale, { maximumFractionDigits: 1 }).format(
              shulkerBoxes,
            ),
          })
        : null
    return { text, shulkers }
  })

  function onInput(event: Event): void {
    const input = event.currentTarget as HTMLInputElement
    materialProgress.set(material.item, input.value === '' ? 0 : Number(input.value))
  }
</script>

<tr class:done={missing === 0}>
  <th scope="row" class="name">
    <span title={material.item}>{name}</span>
    <span class="stacks-inline">{stacks.text}</span>
  </th>
  <td class="num">{count(material.required)}</td>
  <td class="stacks">
    {stacks.text}
    {#if stacks.shulkers}
      <span class="shulkers">{stacks.shulkers}</span>
    {/if}
  </td>
  <td class="owned">
    <input
      type="number"
      min="0"
      step="1"
      inputmode="numeric"
      placeholder="0"
      value={owned > 0 ? owned : ''}
      aria-label={i18n.t('materials.ownedLabel', { name })}
      oninput={onInput}
    />
  </td>
  <td class="num missing">
    {#if missing === 0}
      <span class="complete">{i18n.t('materials.complete')}</span>
    {:else}
      {count(missing)}
    {/if}
  </td>
</tr>

<style>
  tr {
    border-bottom: 1px solid var(--color-border);
  }

  th,
  td {
    padding: var(--space-2) var(--space-2);
    text-align: left;
    vertical-align: middle;
    font-weight: 400;
  }

  .name {
    display: grid;
    gap: 2px;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .num {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
  }

  .stacks {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-2);
    white-space: nowrap;
  }

  .shulkers {
    display: block;
  }

  .stacks-inline {
    display: none;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--color-text-2);
  }

  input {
    width: 5.5em;
    height: 28px;
    padding: 0 var(--space-2);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    background: var(--color-bg);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    text-align: right;
  }

  .done .name span:first-child {
    color: var(--color-text-2);
  }

  .complete {
    font-family: var(--font-sans);
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--color-secondary);
  }

  @media (max-width: 560px) {
    .stacks {
      display: none;
    }

    .stacks-inline {
      display: block;
    }

    input {
      width: 4.5em;
    }
  }
</style>
