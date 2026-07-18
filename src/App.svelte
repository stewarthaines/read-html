<script lang="ts">
  import { onMount } from 'svelte'
  import { downloadBook } from './lib/catalog/download'
  import { downloadFileName, saveBlob } from './lib/library/download'
  import { t } from './lib/i18n/index.svelte'
  import { settings } from './lib/settings/index.svelte'
  import { applyAppTheme } from './lib/theme/app'
  import Library from './lib/library/Library.svelte'
  import { importBook } from './lib/library/import'
  import Reader from './lib/reader/Reader.svelte'
  import { readEmbeddedPayload } from './lib/payload'
  import { createBookStorage } from './lib/storage/index'
  import { sha256Hex } from './lib/storage/hash'
  import { deleteBook, getBook, listBooks, updateBook } from './lib/storage/metadata'
  import { readPayloadPosition, writePayloadPosition } from './lib/storage/payload-position'
  import type { BookRecord } from './lib/storage/types'
  import { debounce } from './lib/util/debounce'

  // Single-page app (§3.3): views switch in state. M2 has the library and
  // the reader; settings and catalog land in later milestones.
  interface OpenedBook {
    id: string
    file: Blob
    position: string | null
    scriptingConsent: boolean | undefined
    /** Filename to save the open book under (the reader's download button). */
    downloadName: string
    /** Embedded-payload book: session trust, dedicated position key. */
    embedded?: boolean
  }

  const storage = createBookStorage()

  let books = $state<BookRecord[]>([])
  let current = $state<OpenedBook>()
  // Deep-linked catalog (?catalog=), browsed by the library's sources pane.
  let initialCatalogUrl = $state<string | null>(null)
  let error = $state('')
  // Feature 11: memory-only storage still reads books but keeps nothing.
  let volatileStorage = $state(false)

  onMount(() => {
    void storage.then((backend) => {
      volatileStorage = backend.kind === 'memory'
    })
    void refresh()
    // A non-empty payload slot wins over deep links (docs/PAYLOAD_SLOT.md).
    if (openEmbedded()) return
    // Deep links (§3.7) are read once at startup, then cleared so reloads
    // return to the app's own state.
    const params = new URLSearchParams(location.search)
    const bookUrl = params.get('book')
    const catalogUrl = params.get('catalog')
    if (bookUrl || catalogUrl) history.replaceState(null, '', location.pathname)
    if (bookUrl) void openFromUrl(bookUrl)
    else if (catalogUrl) initialCatalogUrl = catalogUrl
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

  async function refresh(): Promise<void> {
    books = await listBooks()
  }

  async function handlePick(file: File): Promise<void> {
    error = ''
    try {
      const record = await importBook(await storage, file)
      lastCfi = null
      initialCatalogUrl = null
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

  async function handleOpen(listed: BookRecord): Promise<void> {
    error = ''
    // Re-read the record: consent may have changed in settings since the
    // library list was loaded.
    const record = (await getBook(listed.id)) ?? listed
    const file = await (await storage).get(record.id)
    if (!file) {
      error = t('This book is missing from storage.')
      return
    }
    await updateBook(record.id, { lastOpened: Date.now() })
    lastCfi = null
    // A consumed deep link must not re-open the catalog when the reader closes.
    initialCatalogUrl = null
    current = {
      id: record.id,
      file,
      position: record.position,
      scriptingConsent: record.scriptingConsent,
      downloadName: downloadFileName(record),
    }
  }

  async function openFromUrl(url: string): Promise<void> {
    error = ''
    try {
      const record = await downloadBook(await storage, url, false)
      await handleOpen(record)
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause)
    }
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
  // download turned out to be byte-identical (same id — a no-op update).
  async function handleUpdate(previous: BookRecord, updated: BookRecord): Promise<void> {
    if (updated.id !== previous.id) {
      await (await storage).delete(previous.id)
      await deleteBook(previous.id)
    }
    await handleOpen(updated)
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

  function handleRelocate(location: { cfi: string; fraction: number }): void {
    lastCfi = location.cfi
    if (!current) return
    if (current.embedded) persistPayloadPosition(current.id, location.cfi)
    else persistPosition(current.id, location.cfi, location.fraction)
  }

  const persistPayloadPosition = debounce((id: string, cfi: string) => {
    writePayloadPosition(id, cfi)
  }, 500)

  // §3.4: both answers persist to the book's record. A grant re-renders the
  // book with scripts at the current position (replacing `current` remounts
  // the keyed reader); a denial changes nothing visible — it is already
  // rendered stripped.
  async function handleConsent(granted: boolean): Promise<void> {
    if (!current) return
    await updateBook(current.id, { scriptingConsent: granted })
    if (granted) {
      persistPosition.flush()
      current = {
        ...current,
        position: lastCfi ?? current.position,
        scriptingConsent: true,
      }
    } else {
      current.scriptingConsent = false
    }
  }

  async function handleClose(): Promise<void> {
    persistPosition.flush()
    persistPayloadPosition.flush()
    current = undefined
    await refresh()
  }
</script>

<svelte:window ondragover={(event) => event.preventDefault()} ondrop={handleDrop} />

{#if current}
  {#key current}
    <Reader
      file={current.file}
      initialPosition={current.position}
      scriptingConsent={current.scriptingConsent}
      onrelocate={handleRelocate}
      onconsent={handleConsent}
      ondownload={handleReaderDownload}
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
  {#if error}
    <p role="alert">{error}</p>
  {/if}
  <Library
    {books}
    {storage}
    {initialCatalogUrl}
    onpick={handlePick}
    onopen={handleOpen}
    onupdate={handleUpdate}
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
