<script lang="ts">
  import type { Snippet } from 'svelte'
  import Toaster from '../feedback/Toaster.svelte'
  import TopBar from './TopBar.svelte'

  interface Props {
    children: Snippet
  }

  let { children }: Props = $props()
</script>

<div class="shell">
  <TopBar />
  <main class="content">
    {@render children()}
  </main>
  <Toaster />
</div>

<style>
  .shell {
    display: grid;
    grid-template-rows: var(--topbar-height) minmax(0, 1fr);
    height: 100%;
  }

  .content {
    position: relative;
    min-height: 0;
    overflow: auto;
  }
</style>
