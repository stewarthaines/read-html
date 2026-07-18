<script lang="ts">
  import { onMount } from 'svelte'
  import { t } from '../i18n/index.svelte'
  import type { BookRecord, BookStorage } from '../storage/types'
  import { downloadBook } from './download'
  import { fetchCatalog, type CatalogFeed } from './feed'
  import { saveCatalog, savedCatalogs } from './saved.svelte'

  interface Props {
    /** The saved-catalog root URL for this browse session (governs trust). */
    root: string
    /** Save the root as a catalog on its first successful load. */
    save: boolean
    storage: Promise<BookStorage>
    /** Library books keyed by dc:identifier, to detect books already held. */
    libraryByIdentifier: Map<string, BookRecord>
    onopen: (record: BookRecord) => void
    /** Reports the current feed title, for the library's top bar. */
    ontitle: (title: string) => void
  }
  let { root, save, storage, libraryByIdentifier, onopen, ontitle }: Props = $props()

  let feed = $state<CatalogFeed>()
  let loading = $state(false)
  let error = $state('')
  let busyHref = $state('')

  // §3.4 step 4: downloads are auto-consented when the saved root is trusted.
  const trusted = $derived(savedCatalogs().find((c) => c.url === root)?.trustBooks === true)

  $effect(() => {
    ontitle(feed?.title || t('Catalog'))
  })

  onMount(() => {
    void load(root, save)
  })

  async function load(url: string, saveIt = false): Promise<void> {
    loading = true
    error = ''
    try {
      const loaded = await fetchCatalog(url)
      if (saveIt) saveCatalog(url, loaded.title)
      feed = loaded
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause)
    } finally {
      loading = false
    }
  }

  // Sub-feeds load in place; the library bar's back button always returns to
  // the collection (no per-catalog breadcrumb trail).
  function browse(url: string): void {
    void load(url)
  }

  async function download(href: string): Promise<void> {
    busyHref = href
    error = ''
    try {
      const record = await downloadBook(await storage, href, trusted)
      onopen(record)
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause)
    } finally {
      busyHref = ''
    }
  }

  function heldBook(identifier: string | null): BookRecord | undefined {
    return identifier ? libraryByIdentifier.get(identifier) : undefined
  }
</script>

<div class="feed">
  {#if error}
    <p role="alert">{error}</p>
  {:else if loading && !feed}
    <p>{t('Loading…')}</p>
  {/if}

  {#if feed}
    <ul class="entries">
      {#each feed.entries as entry (entry.href)}
        {@const held = heldBook(entry.identifier)}
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
          {#if entry.kind === 'feed'}
            <button onclick={() => browse(entry.href)}>{t('Browse')}</button>
          {:else if held}
            <button onclick={() => onopen(held)}>{t('Open')}</button>
          {:else}
            <button disabled={busyHref === entry.href} onclick={() => download(entry.href)}>
              {busyHref === entry.href ? t('Downloading…') : t('Download')}
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .feed {
    inline-size: 100%;
    max-inline-size: 40rem;
    margin-inline: auto;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0;
    border-block-end: 1px solid color-mix(in srgb, CanvasText 10%, Canvas);
  }

  li button {
    font: inherit;
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
