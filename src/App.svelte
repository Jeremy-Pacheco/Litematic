<script lang="ts">
  // Root component. The application shell (layout, theme, i18n) arrives in
  // feature/app-shell; until then this only renders a placeholder.
  const appName = 'LitematicViewer'
</script>

<main>
  <h1>{appName}</h1>
</main>

<style>
  main {
    display: grid;
    place-items: center;
    min-height: 100vh;
  }
</style>
