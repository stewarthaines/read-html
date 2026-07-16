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

interface FoliateBook {
  metadata?: { title?: unknown; author?: unknown }
  toc?: TocItem[]
  dir?: string
  transformTarget: EventTarget
  getCover?: () => Promise<Blob | null>
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
}

// §3.4 mechanism step 2: hook the Loader's 'data' event and strip scripts
// from markup resources before their blob: URL is created.
function attachScriptStripping(book: FoliateBook): void {
  book.transformTarget.addEventListener('data', (event) => {
    const detail = (event as CustomEvent<LoaderDataDetail>).detail
    if (!STRIPPABLE_TYPES.includes(detail.type)) return
    detail.data = Promise.resolve(detail.data).then((data) =>
      typeof data === 'string' ? stripScripts(data, detail.type) : data,
    )
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

export interface OpenBookOptions {
  file: Blob
  container: HTMLElement
  /** EPUB CFI to restore; omit to start from the beginning. */
  lastLocation?: string | null
  /** Initial renderer flow ('paginated' | 'scrolled'), applied before first render. */
  flow?: string
  /** Initial user-settings CSS injected into sections, applied before first render. */
  styles?: string
  onSectionLoad: (doc: Document) => void
  onRelocate: (location: Relocation) => void
}

export async function openBook(options: OpenBookOptions): Promise<FoliateViewElement> {
  const book = (await makeBook(options.file)) as FoliateBook
  attachScriptStripping(book)
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
