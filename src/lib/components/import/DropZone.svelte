<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import Icon from '../controls/Icon.svelte'
  import FilePickerButton from './FilePickerButton.svelte'

  interface Props {
    accept: string
    /** True while files are dragged over the window (see WindowDropTarget). */
    dragging: boolean
    onfiles: (files: File[]) => void
  }

  let { accept, dragging, onfiles }: Props = $props()
</script>

<section class="dropzone" class:dragging aria-labelledby="dropzone-title">
  <span class="glyph"><Icon name="upload" size={22} /></span>
  <h1 id="dropzone-title">{i18n.t(dragging ? 'import.dropHere' : 'import.title')}</h1>
  <p class="formats">{i18n.t('import.formats')}</p>
  <FilePickerButton label={i18n.t('import.open')} {accept} {onfiles} />
</section>

<style>
  .dropzone {
    display: grid;
    justify-items: center;
    gap: var(--space-2);
    width: min(520px, 100%);
    padding: var(--space-7) var(--space-5);
    background: var(--color-panel);
    border: 1.5px dashed var(--color-border-strong);
    border-radius: var(--radius-lg);
    text-align: center;
    transition:
      border-color var(--duration),
      background-color var(--duration);
  }

  .dropzone.dragging {
    border-color: var(--color-primary);
    background: var(--color-primary-soft);
  }

  .glyph {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    margin-bottom: var(--space-2);
    border-radius: var(--radius-lg);
    background: var(--color-primary-soft);
    color: var(--color-primary);
  }

  h1 {
    font-size: var(--text-xl);
    font-weight: 600;
    text-wrap: balance;
  }

  .formats {
    margin-bottom: var(--space-3);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--color-text-2);
  }
</style>
