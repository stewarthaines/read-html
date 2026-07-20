// SEED.html is the EPUB editor READ.html ships alongside (README): the built
// reader is served from that deployment. A book opened by `?book=<url>` can be
// handed back to the editor by the same deep-link parameter, in reverse.
const EDITOR_URL = 'https://readitinabook.com/SEED.html'

// The editor needs the book's own URL, not the reader's — so this only ever
// applies to a book acquired from a URL, never one imported from disk.
export function editorUrl(bookUrl: string): string {
  const url = new URL(EDITOR_URL)
  url.searchParams.set('book', bookUrl)
  return url.href
}
