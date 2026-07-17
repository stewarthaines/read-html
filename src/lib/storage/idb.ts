import { BOOKS_STORE, BYTES_STORE, DB_NAME, DB_VERSION } from './keys'

// Opens a fresh connection every call, never caching in module state: the unit
// tests swap the global `indexedDB` (fake-indexeddb) between tests, so a cached
// connection would point at a dead factory.
export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(BOOKS_STORE)) {
        db.createObjectStore(BOOKS_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(BYTES_STORE)) {
        db.createObjectStore(BYTES_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// Runs `fn` inside a single transaction on one store, waits for the transaction
// to complete, and closes the connection (leaving it open hangs fake-indexeddb).
// `fn` must only await IndexedDB requests: awaiting anything else mid-transaction
// lets the transaction auto-commit.
export async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDatabase()
  try {
    const tx = db.transaction(storeName, mode)
    const result = await fn(tx.objectStore(storeName))
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    return result
  } finally {
    db.close()
  }
}
