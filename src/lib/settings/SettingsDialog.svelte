<script lang="ts">
  import { REPO_URL } from '../about'
  import { t } from '../i18n/index.svelte'
  import { listBooks, updateBook } from '../storage/metadata'
  import type { BookRecord } from '../storage/types'
  import { backdropClose } from '../ui/backdrop.svelte'
  import { editorUrl } from '../editor'
  import { FONT_SIZE_MAX, FONT_SIZE_MIN, settings } from './index.svelte'

  interface Props {
    /** Reader context. Present only while a book is open: its own trust
     *  toggle stands in for the library's whole trusted-books list. */
    reading?: {
      /** Absent when the open book's consent is not editable — it has no
       *  scripts to trust, or it is an embedded copy trusted for the session. */
      trust?: { consent: boolean; ontoggle: (granted: boolean) => void }
      /** The URL this book was fetched from (`?book=`), if any. */
      sourceUrl?: string | null
    }
  }
  let { reading }: Props = $props()

  let dialog: HTMLDialogElement
  // §3.4 step 4: books with a recorded consent grant, revocable here.
  let trusted = $state<BookRecord[]>([])

  export function open(): void {
    dialog.showModal()
    if (!reading) void refreshTrusted()
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

<dialog bind:this={dialog} aria-label={t('Settings')} use:backdropClose>
  <form method="dialog">
    <fieldset>
      <legend>{t('Reading mode')}</legend>
      <label><input type="radio" bind:group={settings.flow} value="paginated" /> {t('Pages')}</label
      >
      <label><input type="radio" bind:group={settings.flow} value="scrolled" /> {t('Scroll')}</label
      >
    </fieldset>
    <!-- Columns apply only to pages; the paginator ignores the attribute while
         scrolled, so the choice is disabled rather than hidden — it is kept,
         and takes effect again on returning to pages. -->
    <fieldset disabled={settings.flow !== 'paginated'}>
      <legend>{t('Columns')}</legend>
      <label><input type="radio" bind:group={settings.spread} value="auto" /> {t('Auto')}</label>
      <label><input type="radio" bind:group={settings.spread} value="single" /> {t('Single')}</label
      >
    </fieldset>
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
    {#if reading?.trust}
      <label>
        {t('Trust this book')}
        <input
          type="checkbox"
          checked={reading.trust.consent}
          onchange={(event) => reading?.trust?.ontoggle(event.currentTarget.checked)}
        />
      </label>
    {/if}
    {#if reading?.sourceUrl}
      <p class="edit">
        <a href={editorUrl(reading.sourceUrl)} target="_blank" rel="noopener"
          >{t('Edit in SEED.html')}</a
        >
      </p>
    {/if}
    {#if !reading && trusted.length > 0}
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

  fieldset {
    border: none;
    margin: 0;
    padding: 0;
  }

  fieldset legend {
    padding: 0;
  }

  /* Overrides the space-between row above: a radio belongs beside its text. */
  fieldset label {
    display: inline-flex;
    justify-content: start;
    gap: 0.25rem;
    margin-inline-end: 0.75rem;
  }

  fieldset:disabled {
    opacity: 0.55;
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

  .edit {
    margin: 0;
    font-size: 0.85rem;
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
