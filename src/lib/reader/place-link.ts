// Links to a place in a book (docs/SPEC.md, "Links to a place in a book"): a
// `?book=` link's fragment names a chapter by its file name, optionally an
// element id in it, or an EPUB CFI. The short form is the book's own
// internal href (`wells_research.xhtml#letter`) without the extension and
// with a slash in place of the second `#`, so it survives new editions that
// keep their ids; a CFI is accepted too.

export type PlaceLink = { cfi: string } | { chapter: string; id?: string }

/** A book section as foliate gives it: its href within the EPUB, and its document. */
export interface PlaceSection {
  id: string
  createDocument?: () => Promise<Document>
}

/** The parts of the view a place is resolved against. */
export interface PlaceView {
  book: { sections?: PlaceSection[] }
  resolveNavigation(target: string): { index: number } | undefined
}

const CFI = /^epubcfi\(.*\)$/

/** The place a URL fragment names, or null for no fragment. Decoded once; a
 *  fragment that cannot be decoded is kept as written, and so is not found. */
export function parsePlaceFragment(hash: string): PlaceLink | null {
  const raw = hash.replace(/^#/, '')
  if (!raw) return null
  let text: string
  try {
    text = decodeURIComponent(raw)
  } catch {
    text = raw
  }
  if (CFI.test(text)) return { cfi: text }
  const slash = text.indexOf('/')
  if (slash < 0) return { chapter: text }
  const chapter = text.slice(0, slash)
  const id = text.slice(slash + 1)
  return id ? { chapter, id } : { chapter }
}

const baseName = (href: string) => {
  const file = href.slice(href.lastIndexOf('/') + 1)
  const dot = file.lastIndexOf('.')
  return dot > 0 ? file.slice(0, dot) : file
}

/** The section whose file name, without its extension, is `chapter`; -1 when
 *  none is, or more than one is (the same name in different folders). */
export function chapterIndex(sections: PlaceSection[], chapter: string): number {
  const matches = sections.flatMap((section, index) =>
    baseName(section.id) === chapter ? [index] : [],
  )
  return matches.length === 1 ? matches[0] : -1
}

/** Where to go for `link`, as a target foliate's view navigates to, or null
 *  when the book has no such place. */
export async function resolvePlace(view: PlaceView, link: PlaceLink): Promise<string | null> {
  const sections = view.book.sections ?? []
  if ('cfi' in link) {
    const index = view.resolveNavigation(link.cfi)?.index
    return index !== undefined && index >= 0 && index < sections.length ? link.cfi : null
  }
  const index = chapterIndex(sections, link.chapter)
  if (index < 0) return null
  const section = sections[index]
  if (!link.id) return section.id
  const doc = await section.createDocument?.()
  return doc?.getElementById(link.id) ? `${section.id}#${link.id}` : null
}
