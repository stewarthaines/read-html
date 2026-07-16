// The one module that touches the vendored engine. It registers the
// <foliate-view> custom element and types the exact API surface READ.html
// uses (the engine is untyped JS; changes to the two load-path integration
// points are guarded by scripts/vendor-check.mjs).
import { makeBook } from '../../../vendor/foliate-js/view.js'
import { STRIPPABLE_TYPES, stripScripts } from '../scripting/strip'

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
  metadata?: { title?: unknown; author?: unknown }
  toc?: TocItem[]
  dir?: string
  transformTarget: EventTarget
  getCover?: () => Promise<Blob | null>
  sections?: { id: string }[]
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
  renderer: HTMLElement & { setStyles?: (css: string) => void }
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
// clip data-src rewrite (§8, consented) are mutually exclusive.
function attachMarkupTransform(
  book: FoliateBook,
  allowScripts: boolean,
  clipUrlCache: Map<string, string>,
): void {
  book.transformTarget.addEventListener('data', (event) => {
    const detail = (event as CustomEvent<LoaderDataDetail>).detail
    if (!STRIPPABLE_TYPES.includes(detail.type)) return
    const sectionHref = detail.name ?? ''
    detail.data = Promise.resolve(detail.data).then((data) => {
      if (typeof data !== 'string') return data
      return allowScripts
        ? rewriteClipMarkup(book, data, detail.type, sectionHref, clipUrlCache)
        : stripScripts(data, detail.type)
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
  cover: Blob | null
}

export async function readBookInfo(file: Blob): Promise<BookInfo> {
  const book = (await makeBook(file)) as FoliateBook
  return {
    title: languageMapText(book.metadata?.title),
    author: contributorsText(book.metadata?.author),
    cover: (await book.getCover?.()) ?? null,
  }
}

// §8: foliate rewrites only `src` attributes, so for consented books the
// reader rewrites each clip span's `data-src` to a blob: URL for the same
// bytes (loaded from the book itself); the book's player sees a URL scheme
// and passes it through untouched. This runs in the pre-blob markup
// transform because real players read data-src eagerly at script startup —
// rewriting any later races the book's own code (found with a real book).
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i

function resolveBookHref(href: string, baseHref: string): string {
  const url = new URL(href, `http://readhtml.invalid/${baseHref}`)
  return decodeURI(url.pathname).slice(1)
}

async function rewriteClipMarkup(
  book: FoliateBook,
  markup: string,
  mediaType: string,
  sectionHref: string,
  urlCache: Map<string, string>,
): Promise<string> {
  if (mediaType === 'image/svg+xml') return markup
  const doc = new DOMParser().parseFromString(markup, mediaType as DOMParserSupportedType)
  const spans = Array.from(doc.querySelectorAll('span.clip[data-src]'))
  if (spans.length === 0) return markup
  for (const span of spans) {
    // One unresolvable clip must not break the section: warn loudly, leave
    // the span as-is (it degrades per the publisher contract).
    try {
      const raw = span.getAttribute('data-src')
      if (!raw || HAS_SCHEME.test(raw)) continue
      const href = resolveBookHref(raw, sectionHref)
      let url = urlCache.get(href)
      if (!url) {
        const data = await book.loadBlob?.(href)
        if (!data) {
          console.warn(`READ.html: clip data-src "${raw}" (resolved "${href}") not in the book`)
          continue
        }
        const type = book.resources?.manifest?.find((item) => item.href === href)?.mediaType
        url = URL.createObjectURL(type ? new Blob([data], { type }) : data)
        urlCache.set(href, url)
      }
      span.setAttribute('data-src', url)
    } catch (cause) {
      console.warn('READ.html: clip data-src rewrite failed', span.getAttribute('data-src'), cause)
    }
  }
  return new XMLSerializer().serializeToString(doc)
}

export interface OpenBookOptions {
  file: Blob
  container: HTMLElement
  /** EPUB CFI to restore; omit to start from the beginning. */
  lastLocation?: string | null
  /** Initial renderer flow ('paginated' | 'scrolled'), applied before first render. */
  flow?: string
  /** Initial user-settings CSS injected into sections, applied before first render. */
  styles?: string
  /**
   * §3.4: true only for a book whose record carries an explicit consent
   * grant. Skips script-stripping and enables the §8 data-src rewrite.
   */
  allowScripts?: boolean
  onSectionLoad: (doc: Document) => void
  onRelocate: (location: Relocation) => void
}

export async function openBook(options: OpenBookOptions): Promise<FoliateViewElement> {
  const book = (await makeBook(options.file)) as FoliateBook
  attachMarkupTransform(book, options.allowScripts === true, new Map())
  const view = document.createElement('foliate-view') as FoliateViewElement
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
  if (options.styles) view.renderer.setStyles?.(options.styles)
  await view.init({ lastLocation: options.lastLocation ?? undefined })
  return view
}
