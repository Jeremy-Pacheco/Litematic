<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import { itemDisplayName, type Material, type MaterialList } from '../../materials/materialList'
  import { materialProgress, missingCount } from '../../stores/materials.svelte'
  import { formatCount } from '../../utils/format'
  import Button from '../controls/Button.svelte'
  import SegmentedControl, { type SegmentOption } from '../controls/SegmentedControl.svelte'
  import MaterialRow from './MaterialRow.svelte'

  interface Props {
    list: MaterialList
  }

  let { list }: Props = $props()

  type SortKey = 'required' | 'missing' | 'name'
  type Filter = 'all' | 'pending' | 'done'

  let query = $state('')
  let sort = $state<SortKey>('required')
  let filter = $state<Filter>('all')

  const count = (value: number) => formatCount(value, i18n.locale)

  /** Items already covered, capped at what each material needs. */
  const covered = $derived(
    list.items.reduce((sum, m) => sum + Math.min(m.required, materialProgress.get(m.item)), 0),
  )
  const percent = $derived(list.totalItems > 0 ? Math.floor((covered / list.totalItems) * 100) : 0)
  const hasQuantities = $derived(Object.keys(materialProgress.owned).length > 0)

  const visible = $derived.by(() => {
    const needle = query.trim().toLowerCase()
    const missing = (m: Material) => missingCount(m.required, materialProgress.get(m.item))
    const rows = list.items.filter((m) => {
      if (filter === 'pending' && missing(m) === 0) return false
      if (filter === 'done' && missing(m) > 0) return false
      if (!needle) return true
      return itemDisplayName(m.item).toLowerCase().includes(needle) || m.item.includes(needle)
    })
    const byName = (a: Material, b: Material) =>
      itemDisplayName(a.item).localeCompare(itemDisplayName(b.item), i18n.locale)
    if (sort === 'name') return rows.sort(byName)
    if (sort === 'missing') return rows.sort((a, b) => missing(b) - missing(a) || byName(a, b))
    return rows.sort((a, b) => b.required - a.required || byName(a, b))
  })

  const filterOptions = $derived<SegmentOption<Filter>[]>([
    { value: 'all', label: i18n.t('materials.filter.all'), text: i18n.t('materials.filter.all') },
    {
      value: 'pending',
      label: i18n.t('materials.filter.pending'),
      text: i18n.t('materials.filter.pending'),
    },
    {
      value: 'done',
      label: i18n.t('materials.filter.done'),
      text: i18n.t('materials.filter.done'),
    },
  ])
</script>

<section class="materials" aria-labelledby="materials-title">
  <header class="head">
    <div class="title-row">
      <h2 id="materials-title">{i18n.t('materials.title')}</h2>
      <p class="totals">
        {i18n.t('materials.totals', {
          items: count(list.totalItems),
          types: count(list.items.length),
        })}
      </p>
    </div>

    <div class="progress">
      <div class="progress-label">
        <span>
          {i18n.t('materials.progress', { done: count(covered), total: count(list.totalItems) })}
        </span>
        <span class="percent">{percent} %</span>
      </div>
      <div
        class="track"
        role="progressbar"
        aria-label={i18n.t('materials.title')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div class="fill" style:width="{percent}%"></div>
      </div>
      <p class="hint">{i18n.t('materials.hint')}</p>
    </div>

    <div class="toolbar">
      <input
        class="search"
        type="search"
        placeholder={i18n.t('materials.search')}
        aria-label={i18n.t('materials.search')}
        bind:value={query}
      />
      <label class="sort">
        <span class="visually-hidden">{i18n.t('materials.sort.label')}</span>
        <select bind:value={sort}>
          <option value="required">{i18n.t('materials.sort.required')}</option>
          <option value="missing">{i18n.t('materials.sort.missing')}</option>
          <option value="name">{i18n.t('materials.sort.name')}</option>
        </select>
      </label>
      <SegmentedControl
        label={i18n.t('materials.filter.label')}
        value={filter}
        options={filterOptions}
        onchange={(value) => (filter = value)}
      />
      {#if hasQuantities}
        <Button variant="ghost" onclick={() => materialProgress.clear()}>
          {i18n.t('materials.clear')}
        </Button>
      {/if}
    </div>
  </header>

  {#if list.items.length === 0}
    <p class="empty">{i18n.t('materials.empty')}</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">{i18n.t('materials.columns.material')}</th>
            <th scope="col" class="num">{i18n.t('materials.columns.required')}</th>
            <th scope="col" class="stacks-col">{i18n.t('materials.columns.stacks')}</th>
            <th scope="col">{i18n.t('materials.columns.owned')}</th>
            <th scope="col" class="num">{i18n.t('materials.columns.missing')}</th>
          </tr>
        </thead>
        <tbody>
          {#each visible as material (material.item)}
            <MaterialRow {material} />
          {/each}
        </tbody>
      </table>
      {#if visible.length === 0}
        <p class="empty">{i18n.t('materials.noResults')}</p>
      {/if}
    </div>
  {/if}

  <p class="names-note">{i18n.t('materials.namesNote')}</p>

  {#if list.special.length > 0}
    <details class="special">
      <summary>
        {i18n.t('materials.special.title')}
        <span class="count">({count(list.special.length)})</span>
      </summary>
      <p class="hint">{i18n.t('materials.special.hint')}</p>
      <ul>
        {#each list.special as material (material.item)}
          <li>
            <span class="special-name" title={material.item}>{itemDisplayName(material.item)}</span>
            <span class="kind">
              {i18n.t(
                `materials.special.${material.category === 'fluid' ? 'fluid' : 'unobtainable'}`,
              )}
            </span>
            <span class="num">{count(material.required)}</span>
          </li>
        {/each}
      </ul>
    </details>
  {/if}
</section>

<style>
  .materials {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-4);
    width: 100%;
    padding: var(--space-5);
    background: var(--color-panel);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  .head {
    display: grid;
    gap: var(--space-4);
  }

  .title-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
  }

  h2 {
    font-size: var(--text-lg);
    font-weight: 600;
  }

  .totals {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--color-text-2);
  }

  .progress {
    display: grid;
    gap: var(--space-1);
  }

  .progress-label {
    display: flex;
    justify-content: space-between;
    font-size: var(--text-sm);
  }

  .percent {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }

  .track {
    height: 6px;
    overflow: hidden;
    border-radius: 3px;
    background: var(--color-border);
  }

  .fill {
    height: 100%;
    background: var(--color-secondary);
    transition: width var(--duration) linear;
  }

  .hint,
  .names-note {
    font-size: var(--text-xs);
    color: var(--color-text-2);
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }

  .search {
    flex: 1 1 180px;
    min-width: 0;
    height: 30px;
    padding: 0 var(--space-3);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius);
    background: var(--color-bg);
  }

  select {
    height: 30px;
    padding: 0 var(--space-2);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius);
    background: var(--color-bg);
    color: var(--color-text);
    font: inherit;
    font-size: var(--text-sm);
  }

  .table-wrap {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-md);
  }

  thead th {
    padding: var(--space-1) var(--space-2) var(--space-2);
    border-bottom: 1px solid var(--color-border-strong);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-align: left;
    text-transform: uppercase;
    color: var(--color-text-2);
  }

  thead .num {
    text-align: right;
  }

  .empty {
    padding: var(--space-4) 0;
    color: var(--color-text-2);
    text-align: center;
  }

  .special {
    border-top: 1px solid var(--color-border);
    padding-top: var(--space-3);
  }

  .special summary {
    cursor: pointer;
    font-weight: 600;
  }

  .special .count {
    font-weight: 400;
    color: var(--color-text-2);
  }

  .special .hint {
    margin: var(--space-2) 0;
  }

  .special ul {
    display: grid;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .special li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: var(--space-3);
    align-items: baseline;
    padding: var(--space-1) 0;
  }

  .special-name {
    overflow-wrap: anywhere;
  }

  .kind {
    font-size: var(--text-xs);
    color: var(--color-text-2);
  }

  .special .num {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (max-width: 560px) {
    .materials {
      padding: var(--space-4);
    }

    .stacks-col {
      display: none;
    }
  }
</style>
