<script lang="ts">
  import { t } from '../i18n/index.svelte'
  import { backdropClose } from '../ui/backdrop.svelte'
  import { removeCatalog, savedCatalogs, setCatalogTrust, type SavedCatalog } from './saved.svelte'

  interface Props {
    /** URL of the catalog currently displayed, or null on the collection. */
    activeUrl: string | null
    /** Browse a catalog feed in the main area; `save` records a new URL. */
    onopencatalog: (url: string, options: { save: boolean }) => void
  }
  let { activeUrl, onopencatalog }: Props = $props()

  let dialog: HTMLDialogElement
  let urlInput = $state('')

  export function open(): void {
    dialog.showModal()
  }

  function handleAdd(event: SubmitEvent): void {
    event.preventDefault()
    const url = urlInput.trim()
    if (!url) return
    urlInput = ''
    dialog.close()
    onopencatalog(url, { save: true })
  }

  function openSaved(saved: SavedCatalog): void {
    dialog.close()
    onopencatalog(saved.url, { save: false })
  }
</script>

<dialog bind:this={dialog} class="sources" aria-label={t('Sources')} use:backdropClose>
  <header class="head">
    <button onclick={() => dialog.close()} aria-label={t('Close')} title={t('Close')}>✕</button>
  </header>
  <nav>
    <form onsubmit={handleAdd}>
      <label for="catalog-url">{t('Add a catalog by URL')}</label>
      <input id="catalog-url" type="url" bind:value={urlInput} placeholder="https://" required />
      <button>{t('Add')}</button>
    </form>

    {#if savedCatalogs().length > 0}
      <ul class="saved">
        {#each savedCatalogs() as saved (saved.url)}
          {@const active = saved.url === activeUrl}
          <li class:active aria-current={active ? 'true' : undefined}>
            <button class="link" onclick={() => openSaved(saved)}>{saved.title}</button>
            <!-- Trust and removal apply to the catalog you're viewing, so they
                 appear only on the active one. -->
            {#if active}
              <label class="trust">
                <input
                  type="checkbox"
                  checked={saved.trustBooks}
                  onchange={(event) =>
                    setCatalogTrust(saved.url, (event.currentTarget as HTMLInputElement).checked)}
                />
                {t('Trust books from this catalog')}
              </label>
              <button
                class="remove"
                onclick={() => removeCatalog(saved.url)}
                aria-label="{t('Remove')} {saved.title}">✕</button
              >
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </nav>
</dialog>

<style>
  dialog.sources {
    margin: 0;
    inset-block-start: 0;
    inset-inline-start: 0;
    box-sizing: border-box;
    block-size: 100svh;
    max-block-size: 100svh;
    border: none;
    border-inline-end: 1px solid color-mix(in srgb, CanvasText 20%, Canvas);
    inline-size: 22rem;
    max-inline-size: 85vw;
    overflow-y: auto;
  }

  .head {
    display: flex;
    justify-content: end;
    position: sticky;
    inset-block-start: 0;
    background: Canvas;
    padding-block-end: 0.25rem;
  }

  .head button {
    font: inherit;
    min-inline-size: 2rem;
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  form input,
  form button {
    font: inherit;
  }

  ul.saved {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  li {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.25rem 0.5rem;
    padding-inline-start: 0.5rem;
    border-inline-start: 2px solid transparent;
  }

  li.active {
    border-inline-start-color: CanvasText;
  }

  .link {
    flex: 1;
    min-inline-size: 8rem;
    background: none;
    border: none;
    color: LinkText;
    text-decoration: underline;
    cursor: pointer;
    font: inherit;
    text-align: start;
    overflow-wrap: anywhere;
  }

  li.active .link {
    font-weight: bold;
  }

  .trust {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.8rem;
    flex-basis: 100%;
    color: color-mix(in srgb, CanvasText 70%, Canvas);
  }

  .remove {
    font: inherit;
  }
</style>
