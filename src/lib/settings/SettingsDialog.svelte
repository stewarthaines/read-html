<script lang="ts">
  import { t } from '../i18n'
  import { FONT_SIZE_MAX, FONT_SIZE_MIN, settings } from './index.svelte'

  let dialog: HTMLDialogElement

  export function open(): void {
    dialog.showModal()
  }

  export function isOpen(): boolean {
    return dialog?.open ?? false
  }
</script>

<dialog bind:this={dialog} aria-label={t('Settings')}>
  <form method="dialog">
    <label>
      {t('Reading mode')}
      <select bind:value={settings.flow}>
        <option value="paginated">{t('Pages')}</option>
        <option value="scrolled">{t('Scroll')}</option>
      </select>
    </label>
    <label>
      {t('Font size')}
      <input
        type="range"
        min={FONT_SIZE_MIN}
        max={FONT_SIZE_MAX}
        step="10"
        bind:value={settings.fontSize}
      />
      <span>{settings.fontSize}%</span>
    </label>
    <label>
      {t('Theme')}
      <select bind:value={settings.theme}>
        <option value="auto">{t('Auto')}</option>
        <option value="light">{t('Light')}</option>
        <option value="dark">{t('Dark')}</option>
      </select>
    </label>
    <button>{t('Close')}</button>
  </form>
</dialog>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-inline-size: 14rem;
  }

  label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  button {
    align-self: end;
    font: inherit;
  }
</style>
