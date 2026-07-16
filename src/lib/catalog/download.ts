import { t } from '../i18n/index.svelte'
import { importBook } from '../library/import'
import { updateBook } from '../storage/metadata'
import type { BookRecord, BookStorage } from '../storage/types'
import { fetchFailure } from './feed'

// Download a book by URL — catalog acquisition links and ?book= deep links
// (§3.7) share this path. The href is fetched as-is (CORS applies, no
// proxy). §3.4 step 4: a trusted catalog auto-consents the book at import —
// but never overrides an explicit revocation on an existing copy.
export async function downloadBook(
  storage: BookStorage,
  href: string,
  trusted: boolean,
): Promise<BookRecord> {
  let response: Response
  try {
    response = await fetch(href)
  } catch {
    throw fetchFailure(href, 'book')
  }
  if (!response.ok) {
    throw new Error(t('The book could not be downloaded.') + ` (HTTP ${response.status})`)
  }
  const blob = await response.blob()
  const name = decodeURIComponent(
    new URL(response.url || href).pathname.split('/').pop() || 'book.epub',
  )
  const file = new File([blob], name, { type: blob.type || 'application/epub+zip' })
  const record = await importBook(storage, file)
  if (trusted && record.scriptingConsent === undefined) {
    await updateBook(record.id, { scriptingConsent: true })
    return { ...record, scriptingConsent: true }
  }
  return record
}
