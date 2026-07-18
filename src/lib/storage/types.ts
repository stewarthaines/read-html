// Book bytes persistence (§3.2): one interface, two implementations.
// OPFS is preferred where fully available — its File objects give the
// engine's zip reader random-access reads, so large books open without
// loading fully into memory. IndexedDB is the fallback.
export interface BookStorage {
  readonly kind: 'opfs' | 'idb' | 'memory'
  put(id: string, file: Blob): Promise<void>
  get(id: string): Promise<Blob | null>
  delete(id: string): Promise<void>
}

// Per-book metadata record, one IndexedDB object store, keyed by `id` =
// SHA-256 hex of the book bytes (hashing on import dedupes re-imports).
export interface BookRecord {
  id: string
  title: string
  author: string
  /** Original filename at import (picker/drop) or the acquisition URL basename;
   *  absent for embedded-payload books and records from before 0.1. */
  fileName?: string
  /** The EPUB's dc:identifier, used to detect a catalog book already in the
   *  library; absent when the EPUB declares none or for pre-0.3 records. */
  identifier?: string
  /** The EPUB's dcterms:modified — with `identifier`, the Release Identifier
   *  used to detect that a catalog offers a newer version of a held book.
   *  Absent when the EPUB declares none or for records from before this field. */
  modified?: string
  coverThumb: Blob | null
  /** Reading position as an EPUB CFI string; null before first relocate. */
  position: string | null
  /** Book-level reading fraction (0..1) for the library progress display. */
  fraction: number
  /** Set by the M5 consent flow; absent means never asked. */
  scriptingConsent?: boolean
  lastOpened: number
  addedAt: number
}

// The subset of FileSystemDirectoryHandle the OPFS backend uses, injectable
// so unit tests can supply an in-memory mock (§7).
export interface OpfsDirectory {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<OpfsFileHandle>
  removeEntry(name: string): Promise<void>
}

export interface OpfsFileHandle {
  getFile(): Promise<File>
  createWritable?: () => Promise<{
    write(data: Blob): Promise<void>
    close(): Promise<void>
  }>
}
