<script lang="ts">
  import { onMount } from 'svelte'
  import { t } from './lib/i18n/index.svelte'
  import { settings } from './lib/settings/index.svelte'
  import { applyAppTheme } from './lib/theme/app'
  import Library from './lib/library/Library.svelte'
  import { importBook } from './lib/library/import'
  import Reader from './lib/reader/Reader.svelte'
  import { createBookStorage } from './lib/storage/index'
  import { deleteBook, getBook, listBooks, updateBook } from './lib/storage/metadata'
  import type { BookRecord } from './lib/storage/types'
  import { debounce } from './lib/util/debounce'

  // Single-page app (§3.3): views switch in state. M2 has the library and
  // the reader; settings and catalog land in later milestones.
  interface OpenedBook {
    id: string
    file: Blob
    position: string | null
    scriptingConsent: boolean | undefined
  }

  const storage = createBookStorage()

  let books = $state<BookRecord[]>([])
  let current = $state<OpenedBook>()
  let error = $state('')

  onMount(() => {
    void refresh()
  })

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
      current = {
        id: record.id,
        file,
        position: record.position,
        scriptingConsent: record.scriptingConsent,
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
    current = {
      id: record.id,
      file,
      position: record.position,
      scriptingConsent: record.scriptingConsent,
    }
  }

  async function handleDelete(record: BookRecord): Promise<void> {
    if (!confirm(t('Delete this book from your library?'))) return
    await (await storage).delete(record.id)
    await deleteBook(record.id)
    await refresh()
  }

  // Reading position persists debounced (§3.3) and flushes on close so the
  // last relocate is never lost.
  let lastCfi: string | null = null
  const persistPosition = debounce((id: string, cfi: string, fraction: number) => {
    void updateBook(id, { position: cfi, fraction })
  }, 500)

  function handleRelocate(location: { cfi: string; fraction: number }): void {
    lastCfi = location.cfi
    if (current) persistPosition(current.id, location.cfi, location.fraction)
  }

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
    current = undefined
    await refresh()
  }
</script>

{#if current}
  {#key current}
    <Reader
      file={current.file}
      initialPosition={current.position}
      scriptingConsent={current.scriptingConsent}
      onrelocate={handleRelocate}
      onconsent={handleConsent}
      onclose={handleClose}
    />
  {/key}
{:else}
  {#if error}
    <p role="alert">{error}</p>
  {/if}
  <Library {books} onpick={handlePick} onopen={handleOpen} ondelete={handleDelete} />
{/if}

<style>
  p[role='alert'] {
    margin: 0;
    padding: 0.5rem 1rem;
    border-block-end: 1px solid color-mix(in srgb, CanvasText 20%, Canvas);
  }
</style>
