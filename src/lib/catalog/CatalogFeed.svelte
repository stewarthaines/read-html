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
    /** Replaces a held book with a freshly downloaded newer version. */
    onupdate: (previous: BookRecord, updated: BookRecord) => void
    /** Reports the current feed title, for the library's top bar. */
    ontitle: (title: string) => void
  }
  let { root, save, storage, libraryByIdentifier, onopen, onupdate, ontitle }: Props = $props()

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

  // A teaser (partial entry) carries no acquisition link; resolve its detail
  // feed to the EPUB and acquire that. A detail feed with no EPUB is a loud
  // failure, not a silent no-op.
  async function resolve(detailHref: string): Promise<void> {
    busyHref = detailHref
    error = ''
    try {
      const detail = await fetchCatalog(detailHref)
      const epub = detail.entries.find((entry) => entry.kind === 'epub')
      if (!epub) throw new Error(t('No EPUB found for this book.'))
      const record = await downloadBook(await storage, epub.href, trusted)
      onopen(record)
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause)
    } finally {
      busyHref = ''
    }
  }

  // Re-download a held book's newer version; the parent replaces the old copy.
  async function update(previous: BookRecord, href: string): Promise<void> {
    busyHref = href
    error = ''
    try {
      const updated = await downloadBook(await storage, href, trusted)
      onupdate(previous, updated)
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause)
    } finally {
      busyHref = ''
    }
  }

  function heldBook(identifier: string | null): BookRecord | undefined {
    return identifier ? libraryByIdentifier.get(identifier) : undefined
  }

  // A catalog entry offers an update when its version is strictly newer than
  // the held copy's. Unparseable/absent dates never claim an update.
  function updatable(version: string | null, held: BookRecord | undefined): boolean {
    if (!held?.modified || !version) return false
    const offered = Date.parse(version)
    const owned = Date.parse(held.modified)
    return !Number.isNaN(offered) && !Number.isNaN(owned) && offered > owned
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
      <!-- Keyed by position: the list is replaced wholesale on each load, and
           entries need not have unique hrefs (unsupported ones have none). -->
      {#each feed.entries as entry, index (index)}
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
          {:else if entry.kind === 'unsupported'}
            <button class="badge" disabled title={entry.label ?? ''}>{entry.label}</button>
          {:else if entry.kind === 'teaser'}
            <button disabled={busyHref === entry.href} onclick={() => resolve(entry.href)}>
              {busyHref === entry.href ? t('Downloading…') : t('Download')}
            </button>
          {:else if held && updatable(entry.version, held)}
            <button disabled={busyHref === entry.href} onclick={() => update(held, entry.href)}>
              {busyHref === entry.href ? t('Updating…') : t('Update available')}
            </button>
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

  /* An unavailable acquisition: greyed, non-interactive, labelled with why. */
  .badge {
    color: color-mix(in srgb, CanvasText 55%, Canvas);
    border: 1px solid color-mix(in srgb, CanvasText 25%, Canvas);
    background: none;
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
