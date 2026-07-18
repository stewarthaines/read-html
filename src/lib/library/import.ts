import { readBookInfo } from '../reader/foliate'
import { sha256Hex } from '../storage/hash'
import { getBook, putBook, updateBook } from '../storage/metadata'
import type { BookRecord, BookStorage } from '../storage/types'
import { makeCoverThumb } from './thumbnail'

// Import an EPUB (§3.2): hash the bytes for identity, dedupe re-imports,
// persist bytes and a metadata record extracted from the book itself.
export async function importBook(storage: BookStorage, file: File): Promise<BookRecord> {
  const id = await sha256Hex(file)
  const now = Date.now()
  const existing = await getBook(id)
  if (existing) {
    // Backfill fields captured after this record was first imported.
    const patch: Partial<BookRecord> = { lastOpened: now }
    if (!existing.fileName && file.name) patch.fileName = file.name
    if (!existing.identifier) {
      const identifier = (await readBookInfo(file)).identifier
      if (identifier) patch.identifier = identifier
    }
    await updateBook(id, patch)
    return { ...existing, ...patch }
  }
  const info = await readBookInfo(file)
  const record: BookRecord = {
    id,
    title: info.title || file.name,
    author: info.author,
    fileName: file.name || undefined,
    identifier: info.identifier || undefined,
    coverThumb: info.cover ? await makeCoverThumb(info.cover) : null,
    position: null,
    fraction: 0,
    lastOpened: now,
    addedAt: now,
  }
  await storage.put(id, file)
  await putBook(record)
  return record
}
