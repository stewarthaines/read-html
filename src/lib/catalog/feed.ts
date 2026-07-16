// Catalog fetching and normalization (§3.7), wrapping the vendored opds.js
// (which parses OPDS 1.x Atom into OPDS 2.0-shaped objects; native 2.0 JSON
// feeds already have that shape).
import { getFeed } from '../../../vendor/foliate-js/opds.js'
import { t } from '../i18n/index.svelte'

interface CatalogEntry {
  kind: 'book' | 'feed'
  title: string
  author: string
  summary: string
  /** Absolute URL, resolved against the feed; never re-encoded. */
  href: string
  /** Absolute cover image URL from the feed's image links, if any. */
  coverUrl: string | null
}

export interface CatalogFeed {
  url: string
  title: string
  entries: CatalogEntry[]
}

const ACQUISITION_REL = 'http://opds-spec.org/acquisition'

// §3.7 first-class requirement: hrefs from feeds are used exactly as given
// and resolved against the feed URL. `new URL` does not re-encode an
// already-encoded href — %20 stays %20. Never encodeURI/decodeURI here.
function resolveHref(href: string, base: string): string {
  return new URL(href, base).href
}

// opds.js splits Atom rel attributes on whitespace, so rel is an array
// there; OPDS 2.0 JSON uses plain strings. Accept both.
interface FeedLink {
  rel?: string | string[] | null
  href?: string | null
  type?: string | null
  title?: string | null
}

function relsOf(link: FeedLink): string[] {
  if (Array.isArray(link.rel)) return link.rel
  return typeof link.rel === 'string' ? [link.rel] : []
}

interface FeedPublication {
  metadata?: { title?: unknown; author?: unknown }
  links?: FeedLink[]
  images?: FeedLink[]
}

interface ParsedFeed {
  metadata?: { title?: unknown }
  publications?: FeedPublication[]
  navigation?: (FeedLink & { title?: unknown })[]
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function authorNames(value: unknown): string {
  const list = Array.isArray(value) ? value : value ? [value] : []
  return list
    .map((entry) => {
      const name = (entry as { name?: unknown })?.name
      return typeof name === 'string' ? name : ''
    })
    .filter(Boolean)
    .join(', ')
}

function summaryOf(metadata: object | undefined): string {
  if (!metadata) return ''
  for (const symbol of Object.getOwnPropertySymbols(metadata)) {
    const value = (metadata as Record<symbol, unknown>)[symbol]
    if (typeof value === 'string' && value) return value
    const inner = (value as { value?: unknown })?.value
    if (typeof inner === 'string' && inner) return inner
  }
  return ''
}

function normalize(feed: ParsedFeed, url: string): CatalogFeed {
  const entries: CatalogEntry[] = []
  for (const publication of feed.publications ?? []) {
    const acquisition = publication.links?.find(
      (link) => link.href && relsOf(link).some((rel) => rel.startsWith(ACQUISITION_REL)),
    )
    if (!acquisition?.href) continue
    const cover = publication.images?.find((image) => image.href)
    entries.push({
      kind: 'book',
      title: text(publication.metadata?.title),
      author: authorNames(publication.metadata?.author),
      summary: summaryOf(publication.metadata),
      href: resolveHref(acquisition.href, url),
      coverUrl: cover?.href ? resolveHref(cover.href, url) : null,
    })
  }
  for (const nav of feed.navigation ?? []) {
    if (!nav.href) continue
    entries.push({
      kind: 'feed',
      title: text(nav.title) || nav.href,
      author: '',
      summary: '',
      href: resolveHref(nav.href, url),
      coverUrl: null,
    })
  }
  return { url, title: text(feed.metadata?.title), entries }
}

export function parseCatalog(body: string, url: string): CatalogFeed {
  const trimmed = body.trimStart()
  if (trimmed.startsWith('{')) {
    return normalize(JSON.parse(trimmed) as ParsedFeed, url)
  }
  const doc = new DOMParser().parseFromString(body, 'text/xml')
  if (doc.querySelector('parsererror')) throw new Error('catalog is not valid XML')
  return normalize(getFeed(doc) as ParsedFeed, url)
}

/**
 * A rejected fetch is a network-level failure: for a cross-origin URL the
 * likeliest cause is a missing CORS header (name it — the publisher controls
 * it, §3.7); for a same-origin URL CORS is impossible, so don't mislead.
 */
export function fetchFailure(url: string, subject: 'catalog' | 'book'): Error {
  let crossOrigin = true
  try {
    crossOrigin = new URL(url, location.href).origin !== location.origin
  } catch {
    // Unparseable URL: keep the cross-origin wording; it is still a fetch failure.
  }
  if (subject === 'catalog') {
    return new Error(
      crossOrigin
        ? t(
            'Could not reach the catalog. Its server may not allow cross-origin (CORS) access from this reader.',
          )
        : t('Could not reach the catalog server.'),
    )
  }
  return new Error(
    crossOrigin
      ? t(
          'Could not download the book. Its server may not allow cross-origin (CORS) access from this reader.',
        )
      : t('Could not download the book.'),
  )
}

/**
 * Fetches and parses a catalog. No proxy (§3.7): the catalog host must be
 * CORS-readable from the reader's origin.
 */
export async function fetchCatalog(url: string): Promise<CatalogFeed> {
  let response: Response
  try {
    response = await fetch(url)
  } catch {
    throw fetchFailure(url, 'catalog')
  }
  if (!response.ok) {
    throw new Error(t('The catalog could not be loaded.') + ` (HTTP ${response.status})`)
  }
  return parseCatalog(await response.text(), response.url || url)
}
