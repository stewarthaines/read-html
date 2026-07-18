// Catalog fetching and normalization (§3.7), wrapping the vendored opds.js
// (which parses OPDS 1.x Atom and OPDS 2.0 JSON). We classify each entry into
// the action it affords so real catalogs — where a book may be a multi-format
// download, an external buy/borrow link, or a teaser pointing to a detail
// feed — render correctly, not just a flat "Download" list.
import { getPublication, isOPDSCatalog } from '../../../vendor/foliate-js/opds.js'
import { t } from '../i18n/index.svelte'

// What a catalog row lets the reader do:
// - epub:        a downloadable EPUB (href is the acquisition URL).
// - teaser:      a partial entry (cover + link to a per-book detail feed, no
//                acquisition link); clicking auto-resolves to its EPUB.
// - feed:        a navigation sub-feed to browse (href is the sub-feed URL).
// - unsupported: acquirable only in a way we can't use (non-EPUB format, or a
//                buy/borrow/sample/subscribe link); shown disabled with a label.
type EntryKind = 'epub' | 'teaser' | 'feed' | 'unsupported'

interface CatalogEntry {
  kind: EntryKind
  title: string
  author: string
  summary: string
  /** Publication identifier (dc:identifier), used to detect a book already in
   *  the library without downloading it. Absent when the feed omits it. */
  identifier: string | null
  /** The entry's version signal (dcterms:modified, else atom:updated / OPDS 2.0
   *  metadata.modified) for update detection. Null when the feed omits it. */
  version: string | null
  /** Absolute URL for the entry's action (acquisition / detail feed / sub-feed);
   *  empty for `unsupported`. Resolved against the feed, never re-encoded. */
  href: string
  /** Absolute cover image URL from the feed's image links, if any. */
  coverUrl: string | null
  /** For `unsupported`: a short badge (e.g. "Kindle", "Buy"). Null otherwise. */
  label: string | null
}

export interface CatalogFeed {
  url: string
  title: string
  entries: CatalogEntry[]
}

const ACQUISITION_REL = 'http://opds-spec.org/acquisition'
const EPUB_TYPE = 'application/epub+zip'
// Acquisition rels we can fulfil by fetching bytes directly (no purchase/loan).
const DIRECT_ACQUISITION = new Set([ACQUISITION_REL, `${ACQUISITION_REL}/open-access`])

// §3.7 first-class requirement: hrefs from feeds are used exactly as given
// and resolved against the feed URL. `new URL` does not re-encode an
// already-encoded href — %20 stays %20. Never encodeURI/decodeURI here.
function resolveHref(href: string, base: string): string {
  return new URL(href, base).href
}

// opds.js splits Atom rel attributes on whitespace, so rel is an array
// there; OPDS 2.0 JSON uses plain strings. Accept both.
interface RawLink {
  rel: string[]
  href: string | null
  type: string | null
}

interface RawImage {
  href: string | null
}

// One feed entry, reduced to the fields classification needs, from either the
// Atom (opds.js getPublication) or OPDS 2.0 JSON path.
interface RawEntry {
  title: string
  author: string
  summary: string
  identifier: string | null
  version: string | null
  links: RawLink[]
  images: RawImage[]
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function relsOf(link: { rel?: unknown }): string[] {
  if (Array.isArray(link.rel))
    return link.rel.filter((rel): rel is string => typeof rel === 'string')
  return typeof link.rel === 'string' ? [link.rel] : []
}

function authorNames(value: unknown): string {
  const list = Array.isArray(value) ? value : value ? [value] : []
  return list
    .map((entry) => {
      if (typeof entry === 'string') return entry
      const name = (entry as { name?: unknown })?.name
      return typeof name === 'string' ? name : ''
    })
    .filter(Boolean)
    .join(', ')
}

// opds.js stores an entry's content/summary under a Symbol key ({value, type});
// OPDS 2.0 JSON uses a plain `description`. Read whichever is present.
function summaryOf(metadata: object | undefined): string {
  if (!metadata) return ''
  const description = (metadata as { description?: unknown }).description
  if (typeof description === 'string' && description) return description
  for (const symbol of Object.getOwnPropertySymbols(metadata)) {
    const value = (metadata as Record<symbol, unknown>)[symbol]
    if (typeof value === 'string' && value) return value
    const inner = (value as { value?: unknown })?.value
    if (typeof inner === 'string' && inner) return inner
  }
  return ''
}

function toRawLink(link: { rel?: unknown; href?: unknown; type?: unknown }): RawLink {
  return {
    rel: relsOf(link),
    href: typeof link.href === 'string' ? link.href : null,
    type: typeof link.type === 'string' ? link.type : null,
  }
}

// opds.js `getPublication` output (untyped JS): the fields we read.
interface Publication {
  metadata?: {
    title?: unknown
    author?: unknown
    identifier?: unknown
    description?: unknown
    modified?: unknown
  }
  links?: unknown[]
  images?: { href?: unknown }[]
}

function rawFromPublication(pub: Publication, version: string | null): RawEntry {
  return {
    title: text(pub.metadata?.title),
    author: authorNames(pub.metadata?.author),
    summary: summaryOf(pub.metadata),
    identifier: text(pub.metadata?.identifier) || null,
    version: text(pub.metadata?.modified) || version,
    links: (pub.links ?? []).map((link) => toRawLink(link as object)),
    images: (pub.images ?? []).map((image) => ({
      href: typeof image?.href === 'string' ? image.href : null,
    })),
  }
}

// Atom: run every <entry> through getPublication (uniform rich data, including
// covers for teaser entries that getFeed's publication/navigation split would
// misfile and strip). The version comes from dcterms:modified, else atom:updated.
function xmlEntries(doc: Document): RawEntry[] {
  return Array.from(doc.documentElement.children)
    .filter((element) => element.localName === 'entry')
    .map((entry) => rawFromPublication(getPublication(entry) as Publication, entryVersion(entry)))
}

function entryVersion(entry: Element): string | null {
  const children = Array.from(entry.children)
  const modified = children.find((child) => child.localName === 'modified')?.textContent
  const updated = children.find((child) => child.localName === 'updated')?.textContent
  return modified || updated || null
}

function feedTitle(doc: Document): string {
  const title = Array.from(doc.documentElement.children).find(
    (element) => element.localName === 'title',
  )
  return title?.textContent ?? ''
}

// OPDS 2.0 JSON: publications and navigation are already separate first-class
// arrays; a navigation item is itself a link.
interface ParsedJsonFeed {
  metadata?: { title?: unknown }
  publications?: Publication[]
  navigation?: { title?: unknown; rel?: unknown; href?: unknown; type?: unknown }[]
}

function jsonEntries(parsed: ParsedJsonFeed): RawEntry[] {
  const entries: RawEntry[] = (parsed.publications ?? []).map((pub) =>
    rawFromPublication(pub, null),
  )
  for (const nav of parsed.navigation ?? []) {
    entries.push({
      title: text(nav.title),
      author: '',
      summary: '',
      identifier: null,
      version: null,
      links: [toRawLink(nav)],
      images: [],
    })
  }
  return entries
}

function formatLabel(type: string | null): string {
  if (type === 'application/x-mobipocket-ebook') return t('Kindle')
  if (type === 'application/pdf') return t('PDF')
  return t('Not EPUB')
}

function isDirectAcquisition(link: RawLink): boolean {
  return link.rel.some((rel) => DIRECT_ACQUISITION.has(rel))
}

// A short badge explaining why an acquirable entry can't be downloaded as an
// in-app EPUB: the external-acquisition kind, or the offered (non-EPUB) format.
function unsupportedLabel(acquisition: RawLink[]): string {
  const rels = acquisition.flatMap((link) => link.rel)
  if (rels.some((rel) => rel.endsWith('/buy'))) return t('Buy')
  if (rels.some((rel) => rel.endsWith('/borrow'))) return t('Borrow')
  if (rels.some((rel) => rel.endsWith('/subscribe'))) return t('Subscribe')
  if (rels.some((rel) => rel.endsWith('/sample') || rel === 'preview')) return t('Sample')
  return formatLabel(acquisition[0]?.type ?? null)
}

// Decide what a single entry affords. Order matters: a real acquisition link
// wins over a detail link, and a cover distinguishes a book teaser from a
// plain navigation category.
function classify(raw: RawEntry, url: string): CatalogEntry | null {
  const cover = raw.images.find((image) => image.href)
  const coverUrl = cover?.href ? resolveHref(cover.href, url) : null
  const base = {
    title: raw.title,
    author: raw.author,
    summary: raw.summary,
    identifier: raw.identifier,
    version: raw.version,
    coverUrl,
    label: null,
  }

  const acquisition = raw.links.filter(
    (link) => link.href && link.rel.some((rel) => rel.startsWith(ACQUISITION_REL)),
  )
  if (acquisition.length) {
    // Directly downloadable only when the format is EPUB and the acquisition is
    // unconditional — plain acquisition or open-access, not buy/borrow/etc.,
    // which need an external flow even when the format is EPUB.
    const epub = acquisition.find((link) => link.type === EPUB_TYPE && isDirectAcquisition(link))
    if (epub?.href) return { ...base, kind: 'epub', href: resolveHref(epub.href, url) }
    return { ...base, kind: 'unsupported', href: '', label: unsupportedLabel(acquisition) }
  }

  const catalog = raw.links.find((link) => link.href && isOPDSCatalog(link.type))
  if (catalog?.href) {
    const href = resolveHref(catalog.href, url)
    if (coverUrl) return { ...base, kind: 'teaser', href }
    return { ...base, kind: 'feed', href, coverUrl: null }
  }

  return null
}

export function parseCatalog(body: string, url: string): CatalogFeed {
  const trimmed = body.trimStart()
  let title: string
  let raw: RawEntry[]
  if (trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed) as ParsedJsonFeed
    title = text(parsed.metadata?.title)
    raw = jsonEntries(parsed)
  } else {
    const doc = new DOMParser().parseFromString(body, 'text/xml')
    if (doc.querySelector('parsererror')) throw new Error('catalog is not valid XML')
    title = feedTitle(doc)
    raw = xmlEntries(doc)
  }
  const entries = raw
    .map((entry) => classify(entry, url))
    .filter((entry): entry is CatalogEntry => entry !== null)
  return { url, title, entries }
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
    // no-store: catalogs are living listings, and a cached no-Origin response
    // (no CORS header, no Vary) would otherwise poison future CORS reads.
    response = await fetch(url, { cache: 'no-store' })
  } catch {
    throw fetchFailure(url, 'catalog')
  }
  if (!response.ok) {
    throw new Error(t('The catalog could not be loaded.') + ` (HTTP ${response.status})`)
  }
  return parseCatalog(await response.text(), response.url || url)
}
