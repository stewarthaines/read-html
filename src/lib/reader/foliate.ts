// The one module that touches the vendored engine. It registers the
// <foliate-view> custom element and types the exact API surface READ.html
// uses (the engine is untyped JS; changes to the two load-path integration
// points are guarded by scripts/vendor-check.mjs).
import { makeBook } from '../../../vendor/foliate-js/view.js'
import { rewriteDataSrcMarkup } from '../scripting/data-src'
import { STRIPPABLE_TYPES, stripScripts } from '../scripting/strip'
import { isBookServingAvailable, servedSectionUrl, startBookServer } from './book-server'

export interface TocItem {
  label: string
  href?: string
  subitems?: TocItem[] | null
}

interface ManifestItem {
  href: string
  mediaType?: string
  properties?: string[]
}

interface FoliateBook {
  metadata?: { title?: unknown; author?: unknown; identifier?: unknown; modified?: unknown }
  toc?: TocItem[]
  dir?: string
  transformTarget: EventTarget
  getCover?: () => Promise<Blob | null>
  /** `servedURL` is set by the reader where the book is served (vendored patch 8). */
  sections?: { id: string; servedURL?: string }[]
  resources?: {
    spine?: { properties?: string[] }[]
    manifest?: ManifestItem[]
  }
  loadBlob?: (href: string) => Promise<Blob | null>
}

// §3.4 step 1: detect scripted books before rendering. The publisher
// contract (§8) declares `properties="scripted"` on spine itemrefs; the
// EPUB 3 spec puts it on manifest items. Honor both.
export function bookIsScripted(book: FoliateBook): boolean {
  const spine = book.resources?.spine ?? []
  const manifest = book.resources?.manifest ?? []
  return (
    spine.some((item) => item.properties?.includes('scripted')) ||
    manifest.some((item) => item.properties?.includes('scripted'))
  )
}

interface Relocation {
  fraction: number
  cfi: string
}

interface SectionLoadDetail {
  doc: Document
  index: number
}

export interface FoliateViewElement extends HTMLElement {
  book: FoliateBook
  lastLocation?: Relocation
  /** The paginator (or fixed-layout) element; supports the `flow` attribute
   *  and per-section user-style injection. */
  // render() re-runs the paginator's layout. Attributes that resize the
  // element re-render via its ResizeObserver; ones that only change a CSS
  // custom property (max-column-count) need this called explicitly, exactly
  // as the paginator does internally for max-inline-size.
  renderer: HTMLElement & { setStyles?: (css: string) => void; render?: () => void }
  open(book: FoliateBook): Promise<void>
  init(options: { lastLocation?: string; showTextStart?: boolean }): Promise<void>
  goTo(target: string | number): Promise<unknown>
  goLeft(): Promise<unknown>
  goRight(): Promise<unknown>
  prev(distance?: number): Promise<void>
  next(distance?: number): Promise<void>
  close(): void
}

interface LoaderDataDetail {
  data: unknown
  type: string
  /** Resource href, set read-only by the Loader. */
  name?: string
}

// Both markup transforms run in the Loader's 'data' hook, before the
// resource's blob: URL is created — nothing a book script can observe ever
// carries the untransformed markup. Stripping (§3.4, non-consented) and the
// data-src rewrite (§8, consented) are mutually exclusive. Where the
// book is served (book-server.ts) the result is also kept by section href:
// it is what the served URL answers when the section's frame navigates there.
function attachMarkupTransform(
  book: FoliateBook,
  allowScripts: boolean,
  dataSrcUrlCache: Map<string, string>,
  sectionMarkup: Map<string, string> | null,
): void {
  book.transformTarget.addEventListener('data', (event) => {
    const detail = (event as CustomEvent<LoaderDataDetail>).detail
    if (!STRIPPABLE_TYPES.includes(detail.type)) return
    const sectionHref = detail.name ?? ''
    detail.data = Promise.resolve(detail.data).then(async (data) => {
      if (typeof data !== 'string') return data
      const markup = allowScripts
        ? await rewriteDataSrc(book, data, detail.type, sectionHref, dataSrcUrlCache)
        : stripScripts(data, detail.type)
      sectionMarkup?.set(sectionHref, markup)
      return markup
    })
  })
}

// EPUB metadata values may be language maps ({lang: text}) rather than
// strings; contributors are objects with a `name` language map.
function languageMapText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const first = Object.values(value)[0] as unknown
    if (typeof first === 'string') return first
  }
  return ''
}

function contributorsText(value: unknown): string {
  const list = Array.isArray(value) ? value : value ? [value] : []
  return list
    .map((entry) => languageMapText((entry as { name?: unknown })?.name ?? entry))
    .filter(Boolean)
    .join(', ')
}

export interface BookInfo {
  title: string
  author: string
  identifier: string
  /** The EPUB's dcterms:modified (Release Identifier version), '' if absent. */
  modified: string
  cover: Blob | null
}

export async function readBookInfo(file: Blob): Promise<BookInfo> {
  const book = (await makeBook(file)) as FoliateBook
  return {
    title: languageMapText(book.metadata?.title),
    author: contributorsText(book.metadata?.author),
    identifier: typeof book.metadata?.identifier === 'string' ? book.metadata.identifier : '',
    modified: typeof book.metadata?.modified === 'string' ? book.metadata.modified : '',
    cover: (await book.getCover?.()) ?? null,
  }
}

// §8: each consented section's book-file `data-src` values become blob: URLs
// (src/lib/scripting/data-src.ts); this supplies the bytes from the book
// itself, one URL per file for the book's lifetime.
function rewriteDataSrc(
  book: FoliateBook,
  markup: string,
  mediaType: string,
  sectionHref: string,
  urlCache: Map<string, string>,
): Promise<string> {
  return rewriteDataSrcMarkup(markup, mediaType, sectionHref, async (href) => {
    const cached = urlCache.get(href)
    if (cached) return cached
    const data = await book.loadBlob?.(href)
    if (!data) return null
    const type = book.resources?.manifest?.find((item) => item.href === href)?.mediaType
    const url = URL.createObjectURL(type ? new Blob([data], { type }) : data)
    urlCache.set(href, url)
    return url
  })
}

export interface OpenBookOptions {
  file: Blob
  container: HTMLElement
  /** EPUB CFI to restore; omit to start from the beginning. */
  lastLocation?: string | null
  /** Initial renderer flow ('paginated' | 'scrolled'), applied before first render. */
  flow?: string
  /** Initial paginator column cap ('1' forces a single column), applied
   *  before first render. */
  maxColumnCount?: string
  /** Initial user-settings CSS injected into sections, applied before first render. */
  styles?: string
  /**
   * §3.4: true only for a book whose record carries an explicit consent
   * grant. Skips script-stripping and enables the §8 data-src rewrite.
   */
  allowScripts?: boolean
  /**
   * The id the book is served under while open (docs/SERVED_BOOK.md), where
   * a worker controls the page. Omit and nothing is served.
   */
  bookId?: string
  onSectionLoad: (doc: Document) => void
  onRelocate: (location: Relocation) => void
}

export async function openBook(options: OpenBookOptions): Promise<FoliateViewElement> {
  const book = (await makeBook(options.file)) as FoliateBook
  const allowScripts = options.allowScripts === true
  const served = options.bookId !== undefined && isBookServingAvailable() ? options.bookId : null
  const sectionMarkup = served === null ? null : new Map<string, string>()
  attachMarkupTransform(book, allowScripts, new Map(), sectionMarkup)
  // Serving starts before the first section renders, since the section's
  // own frame is the first to ask; it stops with the view.
  let stopServing = () => {}
  if (served !== null && sectionMarkup) {
    for (const section of book.sections ?? []) {
      section.servedURL = servedSectionUrl(served, section.id)
    }
    stopServing = startBookServer(served, book, allowScripts, sectionMarkup)
  }
  const view = document.createElement('foliate-view') as FoliateViewElement
  const close = view.close.bind(view)
  view.close = () => {
    stopServing()
    close()
  }
  view.addEventListener('load', (event) => {
    options.onSectionLoad((event as CustomEvent<SectionLoadDetail>).detail.doc)
  })
  view.addEventListener('relocate', (event) => {
    const { cfi, fraction } = (event as CustomEvent<Relocation>).detail
    options.onRelocate({ cfi, fraction })
  })
  options.container.append(view)
  await view.open(book)
  // Between open (renderer exists) and init (first section renders): settings
  // applied here take effect from the first paint, with no flash or reflow.
  if (options.flow) view.renderer.setAttribute('flow', options.flow)
  if (options.maxColumnCount) view.renderer.setAttribute('max-column-count', options.maxColumnCount)
  if (options.styles) view.renderer.setStyles?.(options.styles)
  await view.init({ lastLocation: options.lastLocation ?? undefined })
  return view
}
