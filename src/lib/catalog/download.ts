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
    // no-store: fetched once then stored content-hashed; HTTP caching buys
    // nothing and a cached no-Origin response would poison CORS reads.
    response = await fetch(href, { cache: 'no-store' })
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
  // Record where the bytes came from, so a copy reopened from the library can
  // still be handed back to its source. A re-download from a different URL
  // wins: the newest acquisition is the one worth pointing at.
  const patch: Partial<BookRecord> = {}
  if (record.sourceUrl !== href) patch.sourceUrl = href
  if (trusted && record.scriptingConsent === undefined) patch.scriptingConsent = true
  if (Object.keys(patch).length === 0) return record
  await updateBook(record.id, patch)
  return { ...record, ...patch }
}
