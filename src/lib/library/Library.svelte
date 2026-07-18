<script lang="ts">
  import CatalogFeed from '../catalog/CatalogFeed.svelte'
  import SourcesDrawer from '../catalog/SourcesDrawer.svelte'
  import { t } from '../i18n/index.svelte'
  import SettingsDialog from '../settings/SettingsDialog.svelte'
  import type { BookRecord, BookStorage } from '../storage/types'

  interface Props {
    books: BookRecord[]
    storage: Promise<BookStorage>
    /** Deep-linked catalog URL (?catalog=) to browse on load. */
    initialCatalogUrl?: string | null
    onopen: (book: BookRecord) => void
    onupdate: (previous: BookRecord, updated: BookRecord) => void
    ondelete: (book: BookRecord) => void
    ondownload: (book: BookRecord) => void
    onpick: (file: File) => void
  }
  let {
    books,
    storage,
    initialCatalogUrl = null,
    onopen,
    onupdate,
    ondelete,
    ondownload,
    onpick,
  }: Props = $props()

  let settingsDialog: SettingsDialog
  let sourcesDrawer: SourcesDrawer
  // undefined = the downloaded collection; otherwise the catalog being browsed.
  let browse = $state<{ root: string; save: boolean }>()
  // The browsed feed's current title, shown in the bar (like the reader title).
  let feedTitle = $state('')

  // Library books keyed by dc:identifier, so the feed can offer Open instead
  // of Download for a book already held.
  const libraryByIdentifier = $derived(
    new Map(
      books.filter((book) => book.identifier).map((book) => [book.identifier as string, book]),
    ),
  )

  // The deep-linked URL arrives from the parent after this child mounts (child
  // onMount precedes parent onMount), so react to it once when it appears. A
  // deep-linked catalog is saved (deduped) like one added by hand.
  let deepLinkApplied = false
  $effect(() => {
    if (!deepLinkApplied && initialCatalogUrl) {
      deepLinkApplied = true
      browse = { root: initialCatalogUrl, save: true }
    }
  })

  let coverUrls = $state<Map<string, string>>(new Map())
  $effect(() => {
    const urls = new Map(
      books
        .filter((book) => book.coverThumb)
        .map((book) => [book.id, URL.createObjectURL(book.coverThumb as Blob)]),
    )
    coverUrls = urls
    return () => {
      for (const url of urls.values()) URL.revokeObjectURL(url)
    }
  })

  function handlePick(event: Event): void {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    // Reset so picking the same file again still fires a change event.
    input.value = ''
    if (file) onpick(file)
  }
</script>

<SettingsDialog bind:this={settingsDialog} />
<SourcesDrawer
  bind:this={sourcesDrawer}
  activeUrl={browse?.root ?? null}
  onopencatalog={(root, options) => (browse = { root, save: options.save })}
/>

<div class="library">
  <!-- Contextual bar (mirrors the reader's toolbar): the collection is home,
       with the sources menu and a "Library" title. Browsing a catalog adds a
       back button that always returns to the collection, and shows the
       catalog's title. -->
  <header class="bar">
    {#if browse}
      <button onclick={() => (browse = undefined)} aria-label={t('Library')} title={t('Library')}
        >←</button
      >
    {/if}
    <button onclick={() => sourcesDrawer.open()} aria-label={t('Sources')} title={t('Sources')}
      >☰</button
    >
    <h1>{browse ? feedTitle : t('Library')}</h1>
    <button onclick={() => settingsDialog.open()} aria-label={t('Settings')} title={t('Settings')}
      >⚙</button
    >
  </header>

  <main>
    {#if browse}
      {#key browse.root}
        <CatalogFeed
          root={browse.root}
          save={browse.save}
          {storage}
          {libraryByIdentifier}
          {onopen}
          {onupdate}
          ontitle={(value) => (feedTitle = value)}
        />
      {/key}
    {:else}
      <div class="collection">
        <label class="picklabel" for="book-file">{t('Open a book')}</label>
        <input
          id="book-file"
          type="file"
          accept=".epub,application/epub+zip"
          onchange={handlePick}
        />
        {#if books.length > 0}
          <ul class="books">
            {#each books as book (book.id)}
              <li>
                <button class="open" onclick={() => onopen(book)}>
                  {#if coverUrls.has(book.id)}
                    <img class="cover" src={coverUrls.get(book.id)} alt="" />
                  {:else}
                    <span class="cover" aria-hidden="true"></span>
                  {/if}
                  <span class="booktitle">{book.title}</span>
                  <span class="author">{book.author}</span>
                  <span class="progress">{Math.round(book.fraction * 100)}%</span>
                </button>
                <button
                  class="download"
                  onclick={() => ondownload(book)}
                  aria-label="{t('Download')} {book.title}"
                  title={t('Download')}>⤓</button
                >
                <button
                  class="delete"
                  onclick={() => ondelete(book)}
                  aria-label="{t('Delete')} {book.title}">✕</button
                >
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </main>
</div>

<style>
  .library {
    display: flex;
    flex-direction: column;
    min-height: 100svh;
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.5rem;
    border-block-end: 1px solid color-mix(in srgb, CanvasText 20%, Canvas);
  }

  .bar h1 {
    flex: 1;
    margin: 0;
    font-size: 1rem;
    font-weight: normal;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bar button {
    font-size: 1rem;
    min-inline-size: 2rem;
  }

  main {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 1rem;
  }

  .collection {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
  }

  .picklabel {
    font-size: 1.25rem;
  }

  .books {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    justify-content: center;
  }

  li {
    position: relative;
  }

  .open {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    inline-size: 10rem;
    padding: 0.5rem;
    font: inherit;
    background: none;
    border: 1px solid color-mix(in srgb, CanvasText 20%, Canvas);
    cursor: pointer;
  }

  .cover {
    inline-size: 8rem;
    block-size: 12rem;
    object-fit: contain;
    background: color-mix(in srgb, CanvasText 8%, Canvas);
  }

  span.cover {
    display: block;
  }

  .booktitle {
    max-inline-size: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .author,
  .progress {
    font-size: 0.85rem;
    color: color-mix(in srgb, CanvasText 70%, Canvas);
  }

  .delete {
    position: absolute;
    inset-block-start: 0.25rem;
    inset-inline-end: 0.25rem;
    font: inherit;
  }

  .download {
    position: absolute;
    inset-block-start: 0.25rem;
    inset-inline-start: 0.25rem;
    font: inherit;
  }
</style>
