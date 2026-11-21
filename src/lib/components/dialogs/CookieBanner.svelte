<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import { consent } from '../../stores/consent.svelte'
  import Button from '../controls/Button.svelte'

  /**
   * First-visit notice about optional cookies. Accepting and rejecting are
   * equally easy (same size, same place), and nothing optional runs until
   * the user chooses. It does not block the app.
   */
</script>

<section class="banner" aria-labelledby="cookie-banner-title">
  <div class="text">
    <h2 id="cookie-banner-title">{i18n.t('cookies.bannerTitle')}</h2>
    <p>
      {i18n.t('cookies.bannerText')}
      <button type="button" class="link" onclick={() => (consent.dialogOpen = true)}>
        {i18n.t('cookies.policyLink')}
      </button>
    </p>
  </div>
  <div class="actions">
    <Button variant="secondary" onclick={() => consent.decide(false)}>
      {i18n.t('cookies.reject')}
    </Button>
    <Button variant="secondary" onclick={() => consent.decide(true)}>
      {i18n.t('cookies.accept')}
    </Button>
  </div>
</section>

<style>
  .banner {
    position: fixed;
    left: var(--space-3);
    right: var(--space-3);
    bottom: var(--space-3);
    z-index: 50;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3) var(--space-4);
    max-width: 760px;
    margin: 0 auto;
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-panel);
    box-shadow: var(--shadow-pop);
  }

  .text {
    flex: 1 1 360px;
    min-width: 0;
  }

  h2 {
    margin: 0 0 var(--space-1);
    font-size: var(--text-md);
    font-weight: 600;
  }

  p {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--color-text-2);
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-primary);
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }

  .actions {
    display: flex;
    gap: var(--space-2);
  }

  @media (max-width: 520px) {
    .actions {
      width: 100%;
    }

    .actions > :global(*) {
      flex: 1;
    }
  }
</style>
