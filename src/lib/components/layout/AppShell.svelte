<script lang="ts">
  import type { Snippet } from 'svelte'
  import { disableAnalytics, enableAnalytics, measurementId } from '../../analytics/googleAnalytics'
  import { consent } from '../../stores/consent.svelte'
  import AssetsDialog from '../dialogs/AssetsDialog.svelte'
  import CookieBanner from '../dialogs/CookieBanner.svelte'
  import CookieDialog from '../dialogs/CookieDialog.svelte'
  import Toaster from '../feedback/Toaster.svelte'
  import TopBar from './TopBar.svelte'

  interface Props {
    children: Snippet
  }

  let { children }: Props = $props()

  // Analytics only exists in builds with a measurement id (production).
  const analyticsId = measurementId()

  // Google Analytics runs only while the user has accepted it.
  $effect(() => {
    if (!analyticsId || !consent.decided) return
    if (consent.analytics) enableAnalytics(analyticsId)
    else disableAnalytics(analyticsId)
  })
</script>

<div class="shell">
  <TopBar />
  <main class="content">
    {@render children()}
  </main>
  <Toaster />
  <AssetsDialog />
  {#if analyticsId}
    <CookieDialog />
    {#if !consent.decided && !consent.dialogOpen}
      <CookieBanner />
    {/if}
  {/if}
</div>

<style>
  .shell {
    display: grid;
    grid-template-rows: var(--topbar-height) minmax(0, 1fr);
    /* Without an explicit column the implicit `auto` one grows to the widest
       unbreakable content (e.g. a long file name) and overflows phones. */
    grid-template-columns: minmax(0, 1fr);
    height: 100%;
  }

  .content {
    position: relative;
    min-height: 0;
    overflow: auto;
  }
</style>
