<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import { blockDisplayName } from '../../materials/materialList'
  import { assets } from '../../stores/assets.svelte'
  import { layers } from '../../stores/layers.svelte'
  import { blockIndex, type BlockEntity, type Structure, type Vec3 } from '../../types/structure'
  import { formatCount } from '../../utils/format'
  import { nbtTree, type NbtNode } from '../../viewer/nbtTree'
  import Icon from '../controls/Icon.svelte'

  interface Props {
    structure: Structure
    pos: Vec3
    blockEntity: BlockEntity | null
    onclose: () => void
  }

  let { structure, pos, blockEntity, onclose }: Props = $props()

  const count = (n: number) => formatCount(n, i18n.locale)
  const stateIndex = $derived(structure.blocks[blockIndex(structure.size, pos.x, pos.y, pos.z)])
  const state = $derived(structure.palette[stateIndex])
  const properties = $derived(Object.entries(state.properties))
  const sameState = $derived(structure.blockCounts[stateIndex])
  const sameBlock = $derived(
    structure.palette.reduce(
      (sum, s, i) => (s.name === state.name ? sum + structure.blockCounts[i] : sum),
      0,
    ),
  )
  const tree = $derived(blockEntity ? nbtTree(blockEntity.nbt) : [])
  const layerVisible = $derived(
    !layers.range || (pos.y >= layers.range.min && pos.y <= layers.range.max),
  )
</script>

{#snippet nbtNodes(nodes: NbtNode[], hidden: number | undefined)}
  <ul class="nbt">
    {#each nodes as node, i (i)}
      <li>
        {#if node.children}
          <details>
            <summary>
              <span class="key">{node.key}</span>
              <span class="meta">{node.type} · {node.children.length + (node.hidden ?? 0)}</span>
            </summary>
            {@render nbtNodes(node.children, node.hidden)}
          </details>
        {:else}
          <span class="key">{node.key}</span>
          <span class="value">{node.value}</span>
        {/if}
      </li>
    {/each}
    {#if hidden}
      <li class="meta">{i18n.t('inspector.more', { count: count(hidden) })}</li>
    {/if}
  </ul>
{/snippet}

<section class="inspector" aria-labelledby="inspector-title">
  <header>
    <div class="title">
      <h2 id="inspector-title">{blockDisplayName(state, assets.lang)}</h2>
      <code>{state.name}</code>
    </div>
    <button type="button" class="close" aria-label={i18n.t('inspector.close')} onclick={onclose}>
      <Icon name="close" size={14} />
    </button>
  </header>

  <dl>
    <dt>{i18n.t('inspector.position')}</dt>
    <dd class="mono">X {pos.x} · Y {pos.y} · Z {pos.z}</dd>
    <dt>{i18n.t('inspector.layer')}</dt>
    <dd>
      <span class="mono">{pos.y + 1}</span>
      {#if layers.current !== pos.y}
        <button type="button" class="link" onclick={() => layers.setCurrent(pos.y)}>
          {i18n.t('inspector.goToLayer')}
        </button>
      {/if}
    </dd>
    <dt>{i18n.t('inspector.inStructure')}</dt>
    <dd>
      {i18n.t('inspector.count', { state: count(sameState), total: count(sameBlock) })}
    </dd>
  </dl>

  <h3>{i18n.t('inspector.properties')}</h3>
  {#if properties.length > 0}
    <dl class="props">
      {#each properties as [key, value] (key)}
        <dt class="mono">{key}</dt>
        <dd class="mono">{value}</dd>
      {/each}
    </dl>
  {:else}
    <p class="meta">{i18n.t('inspector.noProperties')}</p>
  {/if}

  {#if blockEntity}
    <h3>{i18n.t('inspector.blockEntity')} <code>{blockEntity.id}</code></h3>
    <div class="tree">
      {@render nbtNodes(tree, Math.max(0, blockEntity.nbt.size - tree.length))}
    </div>
  {/if}

  {#if !layerVisible}
    <p class="meta">{i18n.t('inspector.hiddenLayer')}</p>
  {/if}
</section>

<style>
  .inspector {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: 300px;
    max-height: 100%;
    overflow-y: auto;
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--color-panel) 94%, transparent);
    box-shadow: var(--shadow-pop);
    font-size: var(--text-sm);
  }

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .title {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  h2 {
    margin: 0;
    font-size: var(--text-md);
    font-weight: 600;
  }

  h3 {
    margin: var(--space-1) 0 0;
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--color-text-2);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  code,
  .mono {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }

  code {
    overflow-wrap: anywhere;
    color: var(--color-text-2);
    font-size: var(--text-xs);
  }

  h3 code {
    text-transform: none;
    letter-spacing: 0;
    font-weight: 400;
  }

  .close {
    display: grid;
    flex: none;
    place-items: center;
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: var(--color-text-2);
    cursor: pointer;
  }

  .close:hover {
    background: var(--color-panel-hover);
    color: var(--color-text);
  }

  dl {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--space-1) var(--space-3);
    margin: 0;
  }

  dt {
    color: var(--color-text-2);
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .props dt {
    color: var(--color-text-2);
  }

  .link {
    margin-left: var(--space-2);
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-primary);
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }

  .meta {
    margin: 0;
    color: var(--color-text-2);
    font-size: var(--text-xs);
  }

  .tree {
    max-height: 240px;
    overflow: auto;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-bg);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }

  .nbt {
    margin: 0;
    padding-left: var(--space-3);
    list-style: none;
  }

  .tree > .nbt {
    padding-left: 0;
  }

  .nbt li {
    padding: 1px 0;
  }

  summary {
    cursor: pointer;
  }

  .key {
    color: var(--color-secondary);
  }

  .key::after {
    content: ':';
    margin-right: var(--space-1);
    color: var(--color-text-2);
  }

  summary .key::after {
    content: '';
    margin-right: var(--space-1);
  }

  .value {
    overflow-wrap: anywhere;
  }

  @media (max-width: 720px) {
    .inspector {
      width: 100%;
    }
  }
</style>
