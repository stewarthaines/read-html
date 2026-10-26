// §8 and its amendment: foliate rewrites a section's static references
// (`src`, `href`, `poster`, …) to blob: URLs, but not `data-*`. A consented
// book's script that reads a book file named in `data-src` (an audio clip
// span, a parts library a drawing loads) would then fetch a section-relative
// path that resolves to nothing under `about:srcdoc`. For consented books the
// reader gives every `data-src` that names one file of the book a blob: URL
// for the same bytes; the book's script sees a URL scheme and passes it
// through untouched. It runs in the pre-blob markup transform because scripts
// read data-src eagerly at startup — rewriting any later races the book's own
// code (found with a real book).

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i

/** A `data-src` value resolved against its section, as a container-relative book href. */
export function resolveBookHref(href: string, baseHref: string): string {
  const url = new URL(href, `http://readhtml.invalid/${baseHref}`)
  return decodeURI(url.pathname).slice(1)
}

/**
 * Rewrite each `data-src` in a section's markup that names one file of the
 * book to the blob: URL `urlFor` gives it. Values that carry a URL scheme,
 * hold more than one token, or name nothing in the book (`urlFor` returns
 * null: warned to the console) are left as they are, so one bad reference
 * never breaks the section. Markup without a rewritable `data-src` is
 * returned unchanged.
 */
export async function rewriteDataSrcMarkup(
  markup: string,
  mediaType: string,
  sectionHref: string,
  urlFor: (href: string) => Promise<string | null>,
): Promise<string> {
  if (mediaType === 'image/svg+xml') return markup
  const doc = new DOMParser().parseFromString(markup, mediaType as DOMParserSupportedType)
  const elements = Array.from(doc.querySelectorAll('[data-src]'))
  let changed = false
  for (const element of elements) {
    const raw = element.getAttribute('data-src') ?? ''
    if (!raw || HAS_SCHEME.test(raw) || /\s/.test(raw.trim())) continue
    try {
      const href = resolveBookHref(raw.trim(), sectionHref)
      const url = await urlFor(href)
      if (!url) {
        console.warn(`READ.html: data-src "${raw}" (resolved "${href}") not in the book`)
        continue
      }
      element.setAttribute('data-src', url)
      changed = true
    } catch (cause) {
      console.warn('READ.html: data-src rewrite failed', raw, cause)
    }
  }
  return changed ? new XMLSerializer().serializeToString(doc) : markup
}
