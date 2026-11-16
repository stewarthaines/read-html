<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { downloadBook } from './lib/catalog/download'
  import { fetchCatalog } from './lib/catalog/feed'
  import { savedCatalogs } from './lib/catalog/saved.svelte'
  import { findUpdates, type CatalogUpdate } from './lib/catalog/updates'
  import { downloadFileName, saveBlob } from './lib/library/download'
  import { locale, t } from './lib/i18n/index.svelte'
  import type { FetchProgress } from './lib/catalog/fetch-progress'
  import { settings } from './lib/settings/index.svelte'
  import { applyAppTheme } from './lib/theme/app'
  import Library, { type BrowsedCatalog } from './lib/library/Library.svelte'
  import { importBook } from './lib/library/import'
  import Reader from './lib/reader/Reader.svelte'
  import { parsePlaceFragment, type PlaceLink } from './lib/reader/place-link'
  import { readEmbeddedPayload } from './lib/payload'
  import { createBookStorage } from './lib/storage/index'
  import { sha256Hex } from './lib/storage/hash'
  import {
    deleteBook,
    findBookBySource,
    getBook,
    listBooks,
    updateBook,
  } from './lib/storage/metadata'
  import { readPayloadPosition, writePayloadPosition } from './lib/storage/payload-position'
  import type { BookRecord } from './lib/storage/types'
  import { debounce } from './lib/util/debounce'

  // Single-page app (§3.3): views switch in state. M2 has the library and
  // the reader; settings and catalog land in later milestones.
  interface OpenedBook {
    id: string
    file: Blob
    position: string | null
    /** Where to open when there is no position: an updated book. */
    startFraction?: number
    scriptingConsent: boolean | undefined
    /** Filename to save the open book under (the reader's download button). */
    downloadName: string
    /** The URL this copy was fetched from, for the editor hand-off. */
    sourceUrl?: string
    /** Embedded-payload book: session trust, dedicated position key. */
    embedded?: boolean
    /** The place the opening `?book=` link's fragment names. */
    place?: PlaceLink | null
    /** The catalog this book was opened from: Back (and the Library
     *  button) return to it. */
    fromCatalog?: BrowsedCatalog | null
  }

  /** What a history entry records, so Back and Forward can restore it. */
  type EntryState =
    { catalog: BrowsedCatalog } | { book: string; fromCatalog: BrowsedCatalog } | null

  const storage = createBookStorage()

  let books = $state<BookRecord[]>([])
  let current = $state<OpenedBook>()
  // A place named by a new fragment while a book is open (hashchange).
  let jump = $state.raw<PlaceLink | null>(null)
  // The catalog the library browses when it next appears: a ?catalog= link,
  // or the catalog a book was opened from, returned to.
  let initialCatalog = $state.raw<BrowsedCatalog | null>(null)
  // The catalog the library is browsing (null: the collection). It stays set
  // while a book opened from it is open, since the library is unmounted then.
  let browsing: BrowsedCatalog | null = null
  let error = $state('')
  // A `?book=` link on its way in: what the status line says until the reader opens.
  let progress = $state('')
  // Feature 11: memory-only storage still reads books but keeps nothing.
  let volatileStorage = $state(false)
  // Newer versions catalogs offer for library books, keyed by book id.
  let updates = $state.raw<Map<string, CatalogUpdate>>(new Map())
  const updateIds = $derived(new Set(updates.keys()))
  let checkRun = 0

  // Checks the saved catalogs, and each feed a book was acquired from, for
  // newer versions of library books. Runs when the app starts, when the
  // saved catalogs change and whenever the library is shown again; a feed
  // that fails to load just yields no badge.
  async function checkForUpdates(): Promise<void> {
    const run = ++checkRun
    const held = await listBooks()
    const feeds = [
      ...savedCatalogs().map((catalog) => catalog.url),
      ...held.flatMap((book) => (book.catalogUrl ? [book.catalogUrl] : [])),
    ]
    const found = feeds.length > 0 ? await findUpdates(held, feeds, fetchCatalog) : new Map()
    if (run === checkRun) updates = found
  }

  $effect(() => {
    savedCatalogs()
    untrack(() => void checkForUpdates())
  })

  onMount(() => {
    void storage.then((backend) => {
      volatileStorage = backend.kind === 'memory'
    })
    void refresh()
    // A non-empty payload slot wins over deep links (docs/PAYLOAD_SLOT.md).
    if (openEmbedded()) return
    // Deep links (§3.7) are read once at startup. Both stay in the address
    // while their book or catalog is showing, so it can be shared or reloaded.
    const params = new URLSearchParams(location.search)
    const bookUrl = params.get('book')
    const catalogUrl = params.get('catalog')
    // A reload of a book opened from a catalog keeps its way back.
    const entry = history.state as EntryState
    const fromCatalog = entry && 'book' in entry ? entry.fromCatalog : null
    // The fragment is read before opening drops it from the address.
    if (bookUrl) void openFromUrl(bookUrl, parsePlaceFragment(location.hash), fromCatalog)
    else if (catalogUrl) initialCatalog = { root: catalogUrl, save: true }
  })

  // Embedded book: trusted by construction for this session only — consent
  // is never recorded; position lives under the dedicated payload key.
  function openEmbedded(): boolean {
    let file: File | null
    try {
      file = readEmbeddedPayload()
    } catch (cause) {
      error = t('This book could not be opened.') + ' ' + String(cause)
      return true
    }
    if (!file) return false
    void sha256Hex(file).then((id) => {
      lastCfi = null
      current = {
        id,
        file,
        position: readPayloadPosition(id),
        scriptingConsent: true,
        downloadName: file.name,
        embedded: true,
      }
    })
    return true
  }

  $effect(() => {
    applyAppTheme(settings.theme)
  })

  // The address names what is showing — the open book's source (`?book=`) or
  // the browsed catalog (`?catalog=`) — so it can be copied to share it or
  // reloaded to reopen it; otherwise it is the bare page. Only a book opened
  // from a catalog adds a history entry (push); everything else replaces.
  function setAddress(
    show: { book?: string; catalog?: string },
    state: EntryState,
    mode: 'replace' | 'push' = 'replace',
  ): void {
    const url = new URL(location.pathname, location.href)
    if (show.book) url.searchParams.set('book', show.book)
    else if (show.catalog) url.searchParams.set('catalog', show.catalog)
    if (mode === 'push') history.pushState(state, '', url)
    else history.replaceState(state, '', url)
  }

  // The open book's address, keeping what the entry records.
  function showAddress(sourceUrl: string | undefined): void {
    setAddress({ book: sourceUrl }, history.state as EntryState)
  }

  // The library reports each change of catalog; the address follows while
  // no book is open.
  function handleBrowse(next: BrowsedCatalog | null): void {
    if (!next && !browsing) return
    browsing = next
    if (current) return
    if (next) setAddress({ catalog: next.root }, { catalog: next })
    else setAddress({}, null)
  }

  function describeProgress({ loaded, total }: FetchProgress): string {
    const amount =
      total === null
        ? new Intl.NumberFormat(locale(), {
            style: 'unit',
            unit: 'megabyte',
            maximumFractionDigits: 1,
          }).format(loaded / 1_000_000)
        : new Intl.NumberFormat(locale(), { style: 'percent' }).format(loaded / total)
    return `${t('Downloading the book…')} ${amount}`
  }

  async function refresh(): Promise<void> {
    books = await listBooks()
  }

  async function handlePick(file: File): Promise<void> {
    error = ''
    try {
      const record = await importBook(await storage, file)
      lastCfi = null
      initialCatalog = null
      setAddress({}, null)
      current = {
        id: record.id,
        file,
        position: record.position,
        scriptingConsent: record.scriptingConsent,
        downloadName: downloadFileName(record),
      }
    } catch (cause) {
      error = t('This book could not be opened.') + ' ' + String(cause)
    }
  }

  /**
   * Open a library book. Opened from a browsed catalog, it adds a history
   * entry so Back returns there; `restore` reopens such a book in place
   * (Forward, or a reload of its entry) without adding another.
   */
  async function handleOpen(
    listed: BookRecord,
    place: PlaceLink | null = null,
    restore?: { fromCatalog: BrowsedCatalog },
  ): Promise<void> {
    error = ''
    // Re-read the record: consent may have changed in settings since the
    // library list was loaded.
    const record = (await getBook(listed.id)) ?? listed
    const file = await (await storage).get(record.id)
    if (!file) {
      showAddress(undefined)
      error = t('This book is missing from storage.')
      return
    }
    await updateBook(record.id, { lastOpened: Date.now() })
    lastCfi = null
    const fromCatalog = restore ? restore.fromCatalog : browsing
    // What the library shows when the reader closes: the catalog the book
    // came from, else the collection (a consumed deep link must not return).
    initialCatalog = fromCatalog
    if (restore) showAddress(record.sourceUrl)
    else if (fromCatalog) {
      setAddress({ book: record.sourceUrl }, { book: record.id, fromCatalog }, 'push')
    } else setAddress({ book: record.sourceUrl }, null)
    jump = null
    current = {
      id: record.id,
      file,
      position: record.position,
      scriptingConsent: record.scriptingConsent,
      downloadName: downloadFileName(record),
      sourceUrl: record.sourceUrl,
      place,
      fromCatalog,
    }
  }

  // A `?book=` link opens the stored copy it already brought in, if any (no
  // download, works offline); otherwise it downloads with progress showing.
  async function openFromUrl(
    url: string,
    place: PlaceLink | null = null,
    fromCatalog: BrowsedCatalog | null = null,
  ): Promise<void> {
    error = ''
    const restore = fromCatalog ? { fromCatalog } : undefined
    try {
      const stored = await findBookBySource(url)
      if (stored) {
        await handleOpen(stored, place, restore)
        return
      }
      progress = t('Downloading the book…')
      const record = await downloadBook(await storage, url, false, (step) => {
        progress = describeProgress(step)
      })
      progress = t('Opening the book…')
      await handleOpen(record, place, restore)
    } catch (cause) {
      showAddress(undefined)
      error = cause instanceof Error ? cause.message : String(cause)
    } finally {
      progress = ''
    }
  }

  // A link differing only after `#` (pasted while its book is open) moves to
  // that place without reopening; the fragment is then dropped again.
  function handleHashChange(): void {
    const place = parsePlaceFragment(location.hash)
    if (!place || !current?.sourceUrl) return
    jump = place
    showAddress(current.sourceUrl)
  }

  function handleDrop(event: DragEvent): void {
    // Drag-drop import (feature 1, M2 amendment): active outside the reader.
    if (current) return
    event.preventDefault()
    const file = event.dataTransfer?.files?.[0]
    if (file) void handlePick(file)
  }

  async function handleDelete(record: BookRecord): Promise<void> {
    if (!confirm(t('Delete this book from your library?'))) return
    await (await storage).delete(record.id)
    await deleteBook(record.id)
    await refresh()
  }

  // Save the book's original bytes to disk under its original filename (or a
  // title-derived name where none was captured).
  async function handleDownload(record: BookRecord): Promise<void> {
    error = ''
    const blob = await (await storage).get(record.id)
    if (!blob) {
      error = t('This book is missing from storage.')
      return
    }
    saveBlob(blob, downloadFileName(record))
  }

  // Replace a held book with a newer version acquired from a catalog. The new
  // bytes import under their own content hash; drop the prior record unless the
  // download turned out to be byte-identical (same id — a no-op update). The
  // entry then offers Open rather than opening, like a fresh download.
  async function handleUpdate(previous: BookRecord, updated: BookRecord): Promise<void> {
    if (updated.id !== previous.id) {
      await (await storage).delete(previous.id)
      await deleteBook(previous.id)
    }
    dropUpdate(previous.id)
    await refresh()
  }

  function dropUpdate(id: string): void {
    if (updates.has(id)) updates = new Map([...updates].filter(([key]) => key !== id))
  }

  // The reader's Update: download the newer version the catalog offers,
  // replace the held copy and reopen it about where the reader was. The old
  // CFI may not survive the edits, so the new copy opens at the same
  // fraction of the book instead. Consent given to the old copy carries over
  // (same publication) unless the new download recorded its own.
  async function handleBookUpdate(): Promise<void> {
    if (!current) return
    const offer = updates.get(current.id)
    const previous = await getBook(current.id)
    if (!offer || !previous) return
    persistPosition.flush()
    const fraction = lastFraction || previous.fraction
    const trusted = savedCatalogs().some(
      (catalog) => catalog.url === offer.feedUrl && catalog.trustBooks,
    )
    const downloaded = await downloadBook(await storage, offer.href, trusted)
    const replaced = downloaded.id !== previous.id
    const patch: Partial<BookRecord> = {
      catalogVersion: offer.version,
      catalogUrl: offer.feedUrl,
      lastOpened: Date.now(),
    }
    if (replaced) {
      patch.position = null
      patch.fraction = fraction
      if (downloaded.scriptingConsent === undefined && previous.scriptingConsent !== undefined) {
        patch.scriptingConsent = previous.scriptingConsent
      }
    }
    await updateBook(downloaded.id, patch)
    if (replaced) {
      await (await storage).delete(previous.id)
      await deleteBook(previous.id)
    }
    dropUpdate(previous.id)
    if (!replaced) return
    const record: BookRecord = { ...downloaded, ...patch }
    const file = await (await storage).get(record.id)
    if (!file) throw new Error(t('This book is missing from storage.'))
    lastCfi = null
    lastFraction = fraction
    showAddress(record.sourceUrl)
    current = {
      id: record.id,
      file,
      position: null,
      startFraction: fraction,
      scriptingConsent: record.scriptingConsent,
      downloadName: downloadFileName(record),
      sourceUrl: record.sourceUrl,
      fromCatalog: current?.fromCatalog,
    }
  }

  // The reader's download button saves the exact bytes it opened, under the
  // same name the library would use.
  function handleReaderDownload(): void {
    if (!current) return
    saveBlob(current.file, current.downloadName)
  }

  // Reading position persists debounced (§3.3) and flushes on close so the
  // last relocate is never lost.
  let lastCfi: string | null = null
  const persistPosition = debounce((id: string, cfi: string, fraction: number) => {
    void updateBook(id, { position: cfi, fraction })
  }, 500)

  let lastFraction = 0

  function handleRelocate(location: { cfi: string; fraction: number }): void {
    lastCfi = location.cfi
    lastFraction = location.fraction
    if (!current) return
    if (current.embedded) persistPayloadPosition(current.id, location.cfi)
    else persistPosition(current.id, location.cfi, location.fraction)
  }

  const persistPayloadPosition = debounce((id: string, cfi: string) => {
    writePayloadPosition(id, cfi)
  }, 500)

  // §3.4: both answers persist to the book's record. The book re-renders at
  // the current position (replacing `current` remounts the keyed reader) only
  // when the answer contradicts how it is rendered right now — granting to a
  // stripped render, or revoking one already running its scripts. Denying the
  // first-time prompt changes nothing visible; it is already stripped.
  async function handleConsent(granted: boolean): Promise<void> {
    if (!current) return
    await updateBook(current.id, { scriptingConsent: granted })
    if (granted !== (current.scriptingConsent === true)) {
      persistPosition.flush()
      current = {
        ...current,
        position: lastCfi ?? current.position,
        scriptingConsent: granted,
        // The link's place counted on the first open only.
        place: null,
      }
    } else {
      current.scriptingConsent = granted
    }
  }

  // The reader's Library button. A book opened from a catalog goes back
  // through history, exactly as the browser's Back does, so the entries stay
  // in step; any other returns to the library.
  async function handleClose(): Promise<void> {
    const entry = history.state as EntryState
    if (current?.fromCatalog && entry && 'book' in entry) {
      history.back()
      return
    }
    // The address first: nothing below may leave it naming the closed book.
    setAddress({}, null)
    await closeReader()
  }

  async function closeReader(): Promise<void> {
    persistPosition.flush()
    persistPayloadPosition.flush()
    current = undefined
    await refresh()
    void checkForUpdates()
  }

  // Back to a catalog closes the reader and browses it again; Forward to a
  // book opened from a catalog reopens it.
  async function handlePopState(event: PopStateEvent): Promise<void> {
    const entry = event.state as EntryState
    if (entry && 'catalog' in entry) {
      initialCatalog = entry.catalog
      if (current) await closeReader()
    } else if (entry && 'book' in entry && !current) {
      const record = await getBook(entry.book)
      if (record) await handleOpen(record, null, { fromCatalog: entry.fromCatalog })
    }
  }
</script>

<svelte:window
  ondragover={(event) => event.preventDefault()}
  ondrop={handleDrop}
  onhashchange={handleHashChange}
  onpopstate={(event) => void handlePopState(event)}
/>

{#if current}
  {#key current}
    <Reader
      file={current.file}
      bookId={current.id}
      initialPosition={current.position}
      startFraction={current.startFraction}
      place={current.place ?? null}
      {jump}
      scriptingConsent={current.scriptingConsent}
      sourceUrl={current.sourceUrl}
      trustEditable={!current.embedded}
      onrelocate={handleRelocate}
      onconsent={handleConsent}
      ondownload={handleReaderDownload}
      onupdate={updates.has(current.id) && !current.embedded ? handleBookUpdate : undefined}
      onclose={handleClose}
    />
  {/key}
{:else}
  {#if volatileStorage}
    <p role="status" class="notice">
      {t(
        'This browser will not keep books here: your library and reading positions last only until this page closes.',
      )}
    </p>
  {/if}
  {#if progress}
    <p role="status" class="notice">{progress}</p>
  {/if}
  {#if error}
    <p role="alert">{error}</p>
  {/if}
  <Library
    {books}
    updates={updateIds}
    {storage}
    {initialCatalog}
    onbrowse={handleBrowse}
    onpick={handlePick}
    onopen={handleOpen}
    onupdate={handleUpdate}
    onacquire={refresh}
    ondelete={handleDelete}
    ondownload={handleDownload}
  />
{/if}

<style>
  p[role='alert'],
  p.notice {
    margin: 0;
    padding: 0.5rem 1rem;
    border-block-end: 1px solid color-mix(in srgb, CanvasText 20%, Canvas);
  }
</style>
