<script lang="ts">
  import { t } from '../i18n/index.svelte'
  import type { BookRecord, BookStorage } from '../storage/types'
  import { downloadBook } from './download'
  import { fetchCatalog, type CatalogFeed } from './feed'
  import {
    removeCatalog,
    saveCatalog,
    savedCatalogs,
    setCatalogTrust,
    type SavedCatalog,
  } from './saved.svelte'

  interface Props {
    storage: Promise<BookStorage>
    /** Deep-linked catalog URL (?catalog=) to open immediately. */
    initialUrl?: string | null
    onopen: (record: BookRecord) => void
    onback: () => void
  }
  let { storage, initialUrl = null, onopen, onback }: Props = $props()

  let urlInput = $state('')
  let feed = $state<CatalogFeed>()
  let loading = $state(false)
  let error = $state('')
  let busyHref = $state('')
  // Sub-feed navigation history; back pops before leaving the view.
  let trail = $state<string[]>([])

  // The catalog whose feed is showing, if it is a saved one — its trust
  // setting governs downloads from this feed (§3.4 step 4).
  const currentSaved = $derived(savedCatalogs().find((entry) => entry.url === trail[0]))

  $effect(() => {
    if (initialUrl) void loadFeed(initialUrl, { reset: true })
  })

  async function loadFeed(url: string, options: { reset?: boolean; save?: boolean } = {}) {
    loading = true
    error = ''
    try {
      const loaded = await fetchCatalog(url)
      if (options.save) saveCatalog(url, loaded.title)
      feed = loaded
      trail = options.reset ? [url] : [...trail, url]
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause)
    } finally {
      loading = false
    }
  }

  function handleAdd(event: SubmitEvent) {
    event.preventDefault()
    const url = urlInput.trim()
    if (url) void loadFeed(url, { reset: true, save: true })
  }

  function handleBack() {
    if (trail.length > 1) {
      const previous = trail[trail.length - 2]
      trail = trail.slice(0, -2)
      void loadFeed(previous)
    } else if (feed) {
      feed = undefined
      trail = []
      error = ''
    } else {
      onback()
    }
  }

  async function handleDownload(href: string) {
    if (!feed) return
    busyHref = href
    error = ''
    try {
      const record = await downloadBook(await storage, href, currentSaved?.trustBooks === true)
      onopen(record)
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause)
    } finally {
      busyHref = ''
    }
  }

  function openSaved(saved: SavedCatalog) {
    void loadFeed(saved.url, { reset: true })
  }
</script>

<div class="catalog">
  <header class="toolbar">
    <button onclick={handleBack} aria-label={t('Back')} title={t('Back')}>←</button>
    <h1>{feed ? feed.title || t('Catalog') : t('Catalogs')}</h1>
  </header>
  <main>
    {#if error}
      <p role="alert">{error}</p>
    {/if}
    {#if !feed}
      <form onsubmit={handleAdd}>
        <label for="catalog-url">{t('Add a catalog by URL')}</label>
        <input id="catalog-url" type="url" bind:value={urlInput} placeholder="https://" required />
        <button disabled={loading}>{t('Open catalog')}</button>
      </form>
      {#if savedCatalogs().length > 0}
        <ul class="saved">
          {#each savedCatalogs() as saved (saved.url)}
            <li>
              <button class="link" onclick={() => openSaved(saved)}>{saved.title}</button>
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
                onclick={() => removeCatalog(saved.url)}
                aria-label="{t('Remove')} {saved.title}">✕</button
              >
            </li>
          {/each}
        </ul>
      {/if}
    {:else}
      <ul class="entries">
        {#each feed.entries as entry (entry.href)}
          <li>
            {#if entry.coverUrl}
              <img class="cover" src={entry.coverUrl} alt="" />
            {:else}
              <span class="cover" aria-hidden="true"></span>
            {/if}
            <div class="meta">
              <span class="title">{entry.title}</span>
              {#if entry.author}<span class="author">{entry.author}</span>{/if}
              {#if entry.summary}<span class="summary">{entry.summary}</span>{/if}
            </div>
            {#if entry.kind === 'book'}
              <button disabled={busyHref === entry.href} onclick={() => handleDownload(entry.href)}>
                {busyHref === entry.href ? t('Downloading…') : t('Download')}
              </button>
            {:else}
              <button onclick={() => loadFeed(entry.href)}>{t('Browse')}</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </main>
</div>

<style>
  .catalog {
    display: flex;
    flex-direction: column;
    min-height: 100svh;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.5rem;
    border-block-end: 1px solid color-mix(in srgb, CanvasText 20%, Canvas);
  }

  .toolbar h1 {
    flex: 1;
    margin: 0;
    font-size: 1rem;
    font-weight: normal;
    text-align: center;
  }

  .toolbar button {
    font: inherit;
    min-inline-size: 2rem;
  }

  main {
    flex: 1;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    align-items: center;
  }

  form {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  form input {
    min-inline-size: 20rem;
    font: inherit;
  }

  form button,
  li button {
    font: inherit;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    inline-size: 100%;
    max-inline-size: 40rem;
  }

  li {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0;
    border-block-end: 1px solid color-mix(in srgb, CanvasText 10%, Canvas);
  }

  .link {
    background: none;
    border: none;
    color: LinkText;
    text-decoration: underline;
    cursor: pointer;
    font: inherit;
    text-align: start;
  }

  .trust {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.85rem;
    margin-inline-start: auto;
  }

  .cover {
    inline-size: 3rem;
    block-size: 4.5rem;
    object-fit: contain;
    background: color-mix(in srgb, CanvasText 8%, Canvas);
    flex-shrink: 0;
  }

  span.cover {
    display: block;
  }

  .meta {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .author,
  .summary {
    font-size: 0.85rem;
    color: color-mix(in srgb, CanvasText 70%, Canvas);
  }

  p[role='alert'] {
    margin: 0;
  }
</style>
