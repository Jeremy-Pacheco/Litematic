<script lang="ts">
  import { i18n } from '../../i18n/i18n.svelte'
  import { theme, type ThemePreference } from '../../stores/theme.svelte'
  import SegmentedControl, { type SegmentOption } from './SegmentedControl.svelte'

  const options = $derived<SegmentOption<ThemePreference>[]>([
    { value: 'system', label: i18n.t('theme.system'), icon: 'monitor' },
    { value: 'light', label: i18n.t('theme.light'), icon: 'sun' },
    { value: 'dark', label: i18n.t('theme.dark'), icon: 'moon' },
  ])
</script>

<SegmentedControl
  label={i18n.t('theme.label')}
  value={theme.preference}
  {options}
  onchange={(value) => theme.set(value)}
/>
