<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import { consent } from '../../stores/consent.svelte'
  import Button from '../controls/Button.svelte'
  import Icon from '../controls/Icon.svelte'

  /** Cookie settings (change or withdraw consent at any time) and the cookie policy. */
  let dialog: HTMLDialogElement | undefined = $state()

  $effect(() => {
    if (!dialog) return
    if (consent.dialogOpen && !dialog.open) dialog.showModal()
    if (!consent.dialogOpen && dialog.open) dialog.close()
  })

  function choose(analytics: boolean): void {
    consent.decide(analytics)
    consent.dialogOpen = false
  }

  const rows = $derived([
    {
      name: 'lv:*',
      kind: i18n.t('cookies.table.local'),
      purpose: i18n.t('cookies.table.prefs'),
      duration: i18n.t('cookies.table.untilDeleted'),
    },
    {
      name: 'IndexedDB litematicviewer',
      kind: i18n.t('cookies.table.local'),
      purpose: i18n.t('cookies.table.assets'),
      duration: i18n.t('cookies.table.untilDeleted'),
    },
    {
      name: '_ga',
      kind: i18n.t('cookies.table.cookie'),
      purpose: i18n.t('cookies.table.ga'),
      duration: i18n.t('cookies.table.twoYears'),
    },
    {
      name: '_ga_<ID>',
      kind: i18n.t('cookies.table.cookie'),
      purpose: i18n.t('cookies.table.gaSession'),
      duration: i18n.t('cookies.table.twoYears'),
    },
  ])
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="cookies-title"
  onclose={() => (consent.dialogOpen = false)}
  onclick={(event) => {
    if (event.target === dialog) consent.dialogOpen = false
  }}
>
  <div class="content">
    <header class="head">
      <h2 id="cookies-title">{i18n.t('cookies.title')}</h2>
      <button
        type="button"
        class="close"
        aria-label={i18n.t('cookies.close')}
        onclick={() => (consent.dialogOpen = false)}
      >
        <Icon name="close" size={16} />
      </button>
    </header>

    <section class="choice" aria-label={i18n.t('cookies.settings')}>
      <p>
        <strong>{i18n.t('cookies.analyticsTitle')}</strong>
        — {i18n.t('cookies.analyticsText')}
      </p>
      <p class="state">
        {consent.decided
          ? consent.analytics
            ? i18n.t('cookies.stateAccepted')
            : i18n.t('cookies.stateRejected')
          : i18n.t('cookies.stateUndecided')}
      </p>
      <div class="actions">
        <Button variant="secondary" onclick={() => choose(false)}>
          {i18n.t('cookies.reject')}
        </Button>
        <Button variant="secondary" onclick={() => choose(true)}>{i18n.t('cookies.accept')}</Button>
      </div>
    </section>

    <section class="policy">
      <h3>{i18n.t('cookies.policyTitle')}</h3>
      <p>{i18n.t('cookies.policyWho')}</p>
      <p>{i18n.t('cookies.policyFiles')}</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">{i18n.t('cookies.table.name')}</th>
              <th scope="col">{i18n.t('cookies.table.type')}</th>
              <th scope="col">{i18n.t('cookies.table.purpose')}</th>
              <th scope="col">{i18n.t('cookies.table.duration')}</th>
            </tr>
          </thead>
          <tbody>
            {#each rows as row (row.name)}
              <tr>
                <td><code>{row.name}</code></td>
                <td>{row.kind}</td>
                <td>{row.purpose}</td>
                <td>{row.duration}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p>{i18n.t('cookies.policyTechnical')}</p>
      <p>{i18n.t('cookies.policyGoogle')}</p>
      <p>{i18n.t('cookies.policyWithdraw')}</p>
      <p class="links">
        <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
          {i18n.t('cookies.googlePrivacy')}
        </a>
        ·
        <a
          href="https://tools.google.com/dlpage/gaoptout"
          target="_blank"
          rel="noopener noreferrer"
        >
          {i18n.t('cookies.googleOptOut')}
        </a>
      </p>
    </section>
  </div>
</dialog>

<style>
  dialog {
    width: min(640px, calc(100vw - 2 * var(--space-4)));
    max-height: calc(100vh - 2 * var(--space-6));
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-panel);
    color: var(--color-text);
    box-shadow: var(--shadow-pop);
  }

  dialog::backdrop {
    background: rgb(0 0 0 / 0.45);
  }

  .content {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5);
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  h2 {
    font-size: var(--text-lg);
    font-weight: 600;
  }

  h3 {
    font-size: var(--text-md);
    font-weight: 600;
  }

  .close {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
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

  p {
    margin: 0;
    font-size: var(--text-sm);
  }

  .choice {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-3);
    border-left: 2px solid var(--color-secondary);
    background: var(--color-secondary-soft);
  }

  .state {
    color: var(--color-text-2);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .policy {
    display: grid;
    gap: var(--space-2);
    color: var(--color-text-2);
  }

  .policy h3 {
    color: var(--color-text);
  }

  .table-wrap {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-xs);
  }

  th,
  td {
    padding: var(--space-1) var(--space-2);
    border-bottom: 1px solid var(--color-border);
    text-align: left;
    vertical-align: top;
  }

  th {
    color: var(--color-text);
    font-weight: 600;
  }

  code {
    font-family: var(--font-mono);
    white-space: nowrap;
  }

  a {
    color: var(--color-primary);
  }
</style>
