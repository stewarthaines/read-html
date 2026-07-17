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

// Feature 11: when IndexedDB refuses to work (file:// in some engines,
// private modes), records fall back to a session-only in-memory map. The
// switch is one-way; the storage backend's 'memory' kind drives the notice.
let memory: Map<string, StoredBookRecord> | null = null

async function inBooksStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
  fallback: (map: Map<string, StoredBookRecord>) => T,
): Promise<T> {
  if (!memory) {
    try {
      return await withStore(BOOKS_STORE, mode, fn)
    } catch {
      memory = new Map()
    }
  }
  return fallback(memory)
}

export async function listBooks(): Promise<BookRecord[]> {
  const stored = await inBooksStore(
    'readonly',
    (store) => requestResult<StoredBookRecord[]>(store.getAll()),
    (map) => Array.from(map.values()),
  )
  return stored.map(fromStored).sort((a, b) => b.lastOpened - a.lastOpened)
}

export async function getBook(id: string): Promise<BookRecord | undefined> {
  const stored = await inBooksStore(
    'readonly',
    (store) => requestResult<StoredBookRecord | undefined>(store.get(id)),
    (map) => map.get(id),
  )
  return stored ? fromStored(stored) : undefined
}

export async function putBook(record: BookRecord): Promise<void> {
  const stored: StoredBookRecord = { ...record, coverThumb: await toStoredCover(record.coverThumb) }
  await inBooksStore(
    'readwrite',
    (store) => requestResult(store.put(stored)),
    (map) => void map.set(stored.id, stored),
  )
}

export async function updateBook(id: string, patch: Partial<BookRecord>): Promise<void> {
  // Blob conversion must happen before the transaction opens: awaiting a
  // non-IndexedDB promise mid-transaction lets it auto-commit.
  const { coverThumb, ...rest } = patch
  const storedPatch: Partial<StoredBookRecord> = rest
  if (coverThumb !== undefined) storedPatch.coverThumb = await toStoredCover(coverThumb)
  await inBooksStore(
    'readwrite',
    async (store) => {
      const existing = await requestResult<StoredBookRecord | undefined>(store.get(id))
      if (!existing) return
      store.put({ ...existing, ...storedPatch })
    },
    (map) => {
      const existing = map.get(id)
      if (existing) map.set(id, { ...existing, ...storedPatch })
    },
  )
}

export async function deleteBook(id: string): Promise<void> {
  await inBooksStore(
    'readwrite',
    (store) => requestResult(store.delete(id)),
    (map) => void map.delete(id),
  )
}
