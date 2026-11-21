<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import type { Locale } from '../../i18n/translate'
  import SegmentedControl, { type SegmentOption } from './SegmentedControl.svelte'

  const options = $derived<SegmentOption<Locale>[]>([
    { value: 'es', label: i18n.t('language.es'), text: 'ES' },
    { value: 'en', label: i18n.t('language.en'), text: 'EN' },
  ])
</script>

<SegmentedControl
  label={i18n.t('language.label')}
  value={i18n.locale}
  {options}
  onchange={(value) => i18n.set(value)}
/>
