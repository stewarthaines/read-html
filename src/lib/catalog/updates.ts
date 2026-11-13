// Update detection against catalogs: one test shared by the catalog view's
// "Update available" and the library's automatic check.
import type { BookRecord } from '../storage/types'
import type { CatalogFeed } from './feed'

/** A newer version of a held book, as offered by a catalog entry. */
export interface CatalogUpdate {
  /** The entry's acquisition URL. */
  href: string
  /** The entry's version signal, recorded on the book once it is taken. */
  version: string
  /** The feed the entry was found in. */
  feedUrl: string
}

/**
 * True when a catalog entry's version is strictly newer than both the held
 * copy's dcterms:modified and the catalog version it was acquired at (a
 * catalog may date an entry after its EPUB's own modified date). Unparseable
 * or absent dates never claim an update.
 */
export function offersUpdate(version: string | null, held: BookRecord | undefined): boolean {
  if (!held?.modified || !version) return false
  const offered = Date.parse(version)
  const owned = Date.parse(held.modified)
  const acquiredAt = Date.parse(held.catalogVersion ?? '')
  if (Number.isNaN(offered) || Number.isNaN(owned)) return false
  return offered > owned && (Number.isNaN(acquiredAt) || offered > acquiredAt)
}

/**
 * Loads each feed once and returns, keyed by book id, the newer versions they
 * offer for the given books (matched by dc:identifier). A feed that fails to
 * load is skipped: being offline or a catalog being down only means no badge.
 * Sub-feeds are not followed; a book acquired from one records that feed.
 */
export async function findUpdates(
  books: BookRecord[],
  feedUrls: Iterable<string>,
  load: (url: string) => Promise<CatalogFeed>,
): Promise<Map<string, CatalogUpdate>> {
  const byIdentifier = new Map(
    books.filter((book) => book.identifier).map((book) => [book.identifier as string, book]),
  )
  const updates = new Map<string, CatalogUpdate>()
  const feeds = await Promise.all([...new Set(feedUrls)].map((url) => load(url).catch(() => null)))
  for (const feed of feeds) {
    if (!feed) continue
    for (const entry of feed.entries) {
      if (entry.kind !== 'epub' || !entry.identifier || !entry.version) continue
      const held = byIdentifier.get(entry.identifier)
      if (!held || !offersUpdate(entry.version, held)) continue
      const found = updates.get(held.id)
      // Two feeds listing the same book: the newest version wins.
      if (found && Date.parse(found.version) >= Date.parse(entry.version)) continue
      updates.set(held.id, { href: entry.href, version: entry.version, feedUrl: feed.url })
    }
  }
  return updates
}
