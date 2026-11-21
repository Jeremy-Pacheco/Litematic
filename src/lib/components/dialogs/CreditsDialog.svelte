<script lang="ts">
  import { CREDITS, REPOSITORY_URL } from '../../constants/credits'
  import { i18n } from '../../i18n/i18n.svelte'
  import { credits } from '../../stores/credits.svelte'
  import Icon from '../controls/Icon.svelte'

  /** Credits of the open source projects the app is built on, and the legal notice. */
  let dialog: HTMLDialogElement | undefined = $state()

  $effect(() => {
    if (!dialog) return
    if (credits.dialogOpen && !dialog.open) dialog.showModal()
    if (!credits.dialogOpen && dialog.open) dialog.close()
  })
</script>

<dialog
  bind:this={dialog}
  aria-labelledby="credits-title"
  onclose={() => (credits.dialogOpen = false)}
  onclick={(event) => {
    if (event.target === dialog) credits.dialogOpen = false
  }}
>
  <div class="content">
    <header class="head">
      <h2 id="credits-title">{i18n.t('credits.title')}</h2>
      <button
        type="button"
        class="close"
        aria-label={i18n.t('credits.close')}
        onclick={() => (credits.dialogOpen = false)}
      >
        <Icon name="close" size={16} />
      </button>
    </header>

    <p class="intro">{i18n.t('credits.intro')}</p>

    <ul class="list">
      {#each CREDITS as credit (credit.id)}
        <li class:featured={credit.id === 'deepslate'}>
          <div class="name">
            <a href={credit.url} target="_blank" rel="noopener noreferrer">{credit.name}</a>
            <span class="meta">{credit.author} · {credit.license}</span>
          </div>
          <p>{i18n.t(`credits.roles.${credit.id}`)}</p>
        </li>
      {/each}
    </ul>

    <p class="licenses">
      <a href="/licenses.txt" target="_blank" rel="noopener">{i18n.t('credits.licenses')}</a>
    </p>

    <section class="about">
      <p>
        {i18n.t('credits.madeBy')}
        <a href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer">
          {i18n.t('credits.source')}
        </a>
      </p>
      <p class="legal">{i18n.t('credits.notOfficial')}</p>
    </section>
  </div>
</dialog>

<style>
  dialog {
    width: min(560px, calc(100vw - 2 * var(--space-4)));
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

  .intro {
    color: var(--color-text-2);
  }

  .list {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .list li {
    display: grid;
    gap: 2px;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
  }

  .list li.featured {
    border-color: transparent;
    border-left: 2px solid var(--color-secondary);
    border-radius: 0;
    background: var(--color-secondary-soft);
  }

  .list p {
    color: var(--color-text-2);
  }

  .name {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-1) var(--space-2);
  }

  .name a {
    font-weight: 600;
  }

  .meta {
    font-size: var(--text-xs);
    color: var(--color-text-2);
  }

  a {
    color: var(--color-primary);
  }

  .about {
    display: grid;
    gap: var(--space-2);
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-border);
  }

  .legal {
    font-size: var(--text-xs);
    color: var(--color-text-2);
  }
</style>
