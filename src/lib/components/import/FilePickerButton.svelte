<script lang="ts">
  import Button from '../controls/Button.svelte'

  interface Props {
    label: string
    /** Value for the `accept` attribute: a hint for the dialog, not a validation. */
    accept: string
    variant?: 'primary' | 'secondary'
    onfiles: (files: File[]) => void
  }

  let { label, accept, variant = 'primary', onfiles }: Props = $props()

  let input: HTMLInputElement | undefined = $state()

  function onChange(): void {
    if (!input) return
    const files = Array.from(input.files ?? [])
    input.value = '' // allow picking the same file again
    if (files.length > 0) onfiles(files)
  }
</script>

<Button {variant} onclick={() => input?.click()}>{label}</Button>
<input bind:this={input} type="file" {accept} hidden onchange={onChange} />
