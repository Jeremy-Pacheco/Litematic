<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import type { ViewPreset } from '../../managers/CameraManager'
  import { viewer, type ViewerBackground } from '../../stores/viewer.svelte'
  import Icon from '../controls/Icon.svelte'

  interface Props {
    onfit: () => void
    onview: (view: ViewPreset) => void
  }

  let { onfit, onview }: Props = $props()

  const views: ViewPreset[] = ['iso', 'top', 'front', 'side']
  const backgrounds: ViewerBackground[] = ['theme', 'dark', 'light', 'sky']

  function toggle(key: 'grid' | 'box' | 'panelOpen'): void {
    viewer[key] = !viewer[key]
    viewer.save()
  }
</script>

<div class="toolbar" role="toolbar" aria-label={i18n.t('viewer.toolbar')}>
  <button type="button" class="tool" onclick={onfit} title={i18n.t('viewer.fit')}>
    <Icon name="fit" size={15} />
    <span class="label">{i18n.t('viewer.fit')}</span>
  </button>

  <div class="group" role="group" aria-label={i18n.t('viewer.views')}>
    {#each views as view (view)}
      <button type="button" class="tool" onclick={() => onview(view)}>
        {i18n.t(`viewer.view.${view}`)}
      </button>
    {/each}
  </div>

  <div class="group" role="group" aria-label={i18n.t('viewer.helpers')}>
    <button
      type="button"
      class="tool"
      aria-pressed={viewer.grid}
      title={i18n.t('viewer.grid')}
      onclick={() => toggle('grid')}
    >
      <Icon name="grid" size={15} />
      <span class="label">{i18n.t('viewer.grid')}</span>
    </button>
    <button
      type="button"
      class="tool"
      aria-pressed={viewer.box}
      title={i18n.t('viewer.box')}
      onclick={() => toggle('box')}
    >
      <Icon name="box" size={15} />
      <span class="label">{i18n.t('viewer.box')}</span>
    </button>
  </div>

  <label class="tool select">
    <span class="label">{i18n.t('viewer.background')}</span>
    <select
      value={viewer.background}
      aria-label={i18n.t('viewer.background')}
      onchange={(e) => {
        viewer.background = (e.currentTarget as HTMLSelectElement).value as ViewerBackground
        viewer.save()
      }}
    >
      {#each backgrounds as background (background)}
        <option value={background}>{i18n.t(`viewer.backgrounds.${background}`)}</option>
      {/each}
    </select>
  </label>

  <button
    type="button"
    class="tool panel-toggle"
    aria-pressed={viewer.panelOpen}
    title={i18n.t('viewer.panel')}
    onclick={() => toggle('panelOpen')}
  >
    <Icon name="panel" size={15} />
    <span class="label">{i18n.t('viewer.panel')}</span>
  </button>
</div>

<style>
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }

  .group {
    display: inline-flex;
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--color-panel);
  }

  .group .tool {
    border: 0;
    border-radius: 0;
  }

  .group .tool + .tool {
    border-left: 1px solid var(--color-border);
  }

  .tool {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    height: 30px;
    padding: 0 var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-panel);
    color: var(--color-text);
    font-size: var(--text-sm);
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
  }

  .tool:hover {
    background: var(--color-panel-hover);
  }

  .tool[aria-pressed='true'] {
    background: var(--color-primary-soft);
    color: var(--color-primary);
  }

  .select {
    cursor: default;
  }

  select {
    border: 0;
    background: transparent;
    color: var(--color-text);
    font: inherit;
  }

  select option {
    background: var(--color-panel);
  }

  @media (max-width: 720px) {
    .label {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    .select select {
      max-width: 7em;
    }
  }
</style>
