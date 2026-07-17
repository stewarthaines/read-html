<script lang="ts">
  import { REPO_URL } from '../about'
  import { t } from '../i18n/index.svelte'
  import { listBooks, updateBook } from '../storage/metadata'
  import type { BookRecord } from '../storage/types'
  import { FONT_SIZE_MAX, FONT_SIZE_MIN, settings } from './index.svelte'

  let dialog: HTMLDialogElement
  // §3.4 step 4: books with a recorded consent grant, revocable here.
  let trusted = $state<BookRecord[]>([])

  export function open(): void {
    dialog.showModal()
    void refreshTrusted()
  }

  export function isOpen(): boolean {
    return dialog?.open ?? false
  }

  async function refreshTrusted(): Promise<void> {
    trusted = (await listBooks()).filter((book) => book.scriptingConsent === true)
  }

  async function revoke(book: BookRecord): Promise<void> {
    await updateBook(book.id, { scriptingConsent: false })
    trusted = trusted.filter((entry) => entry.id !== book.id)
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
    {#if trusted.length > 0}
      <section aria-label={t('Trusted books')}>
        <h2>{t('Trusted books')}</h2>
        <p>{t('These books may run their interactive features.')}</p>
        <ul>
          {#each trusted as book (book.id)}
            <li>
              <span>{book.title}</span>
              <button type="button" onclick={() => revoke(book)}>{t('Revoke')}</button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
    <button>{t('Close')}</button>
    <!-- §3.8 about panel: the name, one plain sentence, the license, the
         source link. Nothing else. -->
    <footer class="about">
      <p>READ.html — {t('A reader for EPUB books that works in your browser.')}</p>
      <p><a href={REPO_URL}>{t('Source code')}</a> · {t('MIT license')}</p>
    </footer>
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

  section h2 {
    margin: 0.5rem 0 0;
    font-size: 1rem;
    font-weight: normal;
  }

  section p {
    margin: 0.25rem 0;
    font-size: 0.85rem;
    color: color-mix(in srgb, CanvasText 70%, Canvas);
  }

  section ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  section li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding-block: 0.25rem;
  }

  .about {
    border-block-start: 1px solid color-mix(in srgb, CanvasText 20%, Canvas);
    padding-block-start: 0.5rem;
    font-size: 0.85rem;
    color: color-mix(in srgb, CanvasText 70%, Canvas);
  }

  .about p {
    margin: 0.25rem 0;
  }
</style>
