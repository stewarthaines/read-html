import type { BookRecord } from '../storage/types'

// Characters unsafe in a filename across common filesystems; spaces and
// hyphens are fine and kept.
const UNSAFE = /[\\/:*?"<>|]/g

/**
 * The name to save a book under: its stored original filename verbatim, or —
 * for embedded-payload books and pre-0.1 records that have none — a name
 * derived from the title.
 */
export function downloadFileName(record: BookRecord): string {
  if (record.fileName?.trim()) return record.fileName
  const base = record.title.replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim() || 'book'
  return base.toLowerCase().endsWith('.epub') ? base : `${base}.epub`
}

/** Triggers a browser download of a blob under the given filename. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // Revoke after the current task so the download has begun.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
