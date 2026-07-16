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
  metadata?: { title?: unknown }
  toc?: TocItem[]
  dir?: string
  transformTarget: EventTarget
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

export async function openBook(
  file: File,
  container: HTMLElement,
  onSectionLoad: (doc: Document) => void,
): Promise<FoliateViewElement> {
  const book = (await makeBook(file)) as FoliateBook
  attachScriptStripping(book)
  const view = document.createElement('foliate-view') as FoliateViewElement
  view.addEventListener('load', (event) => {
    onSectionLoad((event as CustomEvent<SectionLoadDetail>).detail.doc)
  })
  container.append(view)
  await view.open(book)
  await view.init({})
  return view
}
