import { BOOKS_STORE } from './keys'
import { requestResult, withStore } from './idb'
import type { BookRecord } from './types'

// Cover thumbnails persist as { buffer, type } rather than a Blob (structured-
// cloning Blobs is unreliable under fake-indexeddb/jsdom); the public API deals
// only in BookRecord with a real Blob.
interface StoredCover {
  buffer: ArrayBuffer
  type: string
}

interface StoredBookRecord extends Omit<BookRecord, 'coverThumb'> {
  coverThumb: StoredCover | null
}

async function toStoredCover(cover: Blob | null): Promise<StoredCover | null> {
  return cover ? { buffer: await cover.arrayBuffer(), type: cover.type } : null
}

function fromStored(stored: StoredBookRecord): BookRecord {
  return {
    ...stored,
    coverThumb: stored.coverThumb
      ? new Blob([stored.coverThumb.buffer], { type: stored.coverThumb.type })
      : null,
  }
}

export async function listBooks(): Promise<BookRecord[]> {
  const stored = await withStore(BOOKS_STORE, 'readonly', (store) =>
    requestResult<StoredBookRecord[]>(store.getAll()),
  )
  return stored.map(fromStored).sort((a, b) => b.lastOpened - a.lastOpened)
}

export async function getBook(id: string): Promise<BookRecord | undefined> {
  const stored = await withStore(BOOKS_STORE, 'readonly', (store) =>
    requestResult<StoredBookRecord | undefined>(store.get(id)),
  )
  return stored ? fromStored(stored) : undefined
}

export async function putBook(record: BookRecord): Promise<void> {
  const stored: StoredBookRecord = { ...record, coverThumb: await toStoredCover(record.coverThumb) }
  await withStore(BOOKS_STORE, 'readwrite', (store) => requestResult(store.put(stored)))
}

export async function updateBook(id: string, patch: Partial<BookRecord>): Promise<void> {
  // Blob conversion must happen before the transaction opens: awaiting a
  // non-IndexedDB promise mid-transaction lets it auto-commit.
  const { coverThumb, ...rest } = patch
  const storedPatch: Partial<StoredBookRecord> = rest
  if (coverThumb !== undefined) storedPatch.coverThumb = await toStoredCover(coverThumb)
  await withStore(BOOKS_STORE, 'readwrite', async (store) => {
    const existing = await requestResult<StoredBookRecord | undefined>(store.get(id))
    if (!existing) return
    store.put({ ...existing, ...storedPatch })
  })
}

export async function deleteBook(id: string): Promise<void> {
  await withStore(BOOKS_STORE, 'readwrite', (store) => requestResult(store.delete(id)))
}
