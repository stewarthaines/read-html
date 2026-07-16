import { BYTES_STORE } from './keys'
import { requestResult, withStore } from './idb'
import type { BookStorage } from './types'

// Bytes persist as { buffer, type } rather than a Blob: structured-cloning
// Blobs is unreliable under fake-indexeddb/jsdom, and ArrayBuffers behave the
// same there and in real browsers.
interface StoredBytes {
  buffer: ArrayBuffer
  type: string
}

export class IdbBookStorage implements BookStorage {
  readonly kind = 'idb' as const

  async put(id: string, file: Blob): Promise<void> {
    const stored: StoredBytes = { buffer: await file.arrayBuffer(), type: file.type }
    await withStore(BYTES_STORE, 'readwrite', (store) => requestResult(store.put(stored, id)))
  }

  async get(id: string): Promise<Blob | null> {
    const stored = await withStore(BYTES_STORE, 'readonly', (store) =>
      requestResult<StoredBytes | undefined>(store.get(id)),
    )
    return stored ? new Blob([stored.buffer], { type: stored.type }) : null
  }

  async delete(id: string): Promise<void> {
    await withStore(BYTES_STORE, 'readwrite', (store) => requestResult(store.delete(id)))
  }
}
