// The served book (docs/SERVED_BOOK.md). Where a service worker on the
// host origin answers `GET /__book/<book>/<path>` by asking its window
// clients for the bytes over a message channel, this page answers for the
// book it has open, and each section is loaded by navigating its frame to
// the served URL (vendored patch 8) rather than as `srcdoc`, so the section
// document has a real address and a reference a consented book's script
// builds at runtime resolves to the book's own file. Where no worker
// controls the page (a file:// copy, a plain static host) nothing here runs
// and sections load as `srcdoc`, as before.
import { STRIPPABLE_TYPES, stripScripts } from '../scripting/strip'

/** The route the host's worker reserves; the book id and container path follow. */
export const BOOK_ROUTE = '/__book/'

/** The worker's question, posted to every window client with a reply port. */
export interface BookFileRequest {
  type: 'book-file'
  workspaceId: string
  path: string
}

/**
 * `not-found`: this page has the book but not the file, so the worker can
 * stop waiting. `not-mine`: the book is not this page's; another page may
 * still answer.
 */
export type BookFileReply =
  | { ok: true; bytes: ArrayBuffer; contentType: string }
  | { ok: false; reason: 'not-found' | 'not-mine' }

/** What the page needs from the open book to answer. */
export interface ServedBook {
  loadBlob?: (href: string) => Promise<Blob | null>
  resources?: { manifest?: { href: string; mediaType?: string }[] }
}

/** Whether a base under the route means anything here: http with a worker in control. */
export function isBookServingAvailable(): boolean {
  if (typeof location === 'undefined' || !location.protocol.startsWith('http')) return false
  return !!(typeof navigator !== 'undefined' && navigator.serviceWorker?.controller)
}

/** The route path for a container path, without the availability check (testable). */
export function bookRoutePath(bookId: string, path: string, origin = ''): string {
  const segments = path
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.')
    .map(encodeURIComponent)
  return `${origin}${BOOK_ROUTE}${encodeURIComponent(bookId)}/${segments.join('/')}`
}

/** The absolute URL a section is served at; its frame navigates there. */
export function servedSectionUrl(bookId: string, sectionHref: string): string {
  return bookRoutePath(bookId, sectionHref, location.origin)
}

/**
 * Answer one request from the open book. A section the engine has prepared
 * (its markup transformed and its references rewritten to blob: URLs) is
 * answered with that markup, which is what its frame navigates to. Any
 * other markup leaves stripped unless the book has consent, so the route
 * never hands out more than a frame would have received.
 */
export async function answerBookFile(
  book: ServedBook,
  bookId: string,
  allowScripts: boolean,
  sectionMarkup: ReadonlyMap<string, string>,
  request: BookFileRequest,
): Promise<BookFileReply> {
  if (request.workspaceId !== bookId) return { ok: false, reason: 'not-mine' }
  const manifestType = book.resources?.manifest?.find(
    (item) => item.href === request.path,
  )?.mediaType
  const prepared = sectionMarkup.get(request.path)
  if (prepared !== undefined) {
    return {
      ok: true,
      bytes: new TextEncoder().encode(prepared).buffer as ArrayBuffer,
      contentType: manifestType || 'application/xhtml+xml',
    }
  }
  const blob = await Promise.resolve()
    .then(() => book.loadBlob?.(request.path) ?? null)
    .catch(() => null)
  if (!blob) return { ok: false, reason: 'not-found' }
  const contentType = manifestType || blob.type || 'application/octet-stream'
  if (!allowScripts && STRIPPABLE_TYPES.includes(contentType)) {
    const stripped = stripScripts(await blob.text(), contentType)
    return {
      ok: true,
      bytes: new TextEncoder().encode(stripped).buffer as ArrayBuffer,
      contentType,
    }
  }
  return { ok: true, bytes: await blob.arrayBuffer(), contentType }
}

function isBookFileRequest(value: unknown): value is BookFileRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'book-file' &&
    typeof (value as { workspaceId?: unknown }).workspaceId === 'string' &&
    typeof (value as { path?: unknown }).path === 'string'
  )
}

/**
 * Answer the worker's requests for this book until the returned stop
 * function is called. Where no worker controls the page it never hears
 * anything and costs nothing.
 */
export function startBookServer(
  bookId: string,
  book: ServedBook,
  allowScripts: boolean,
  sectionMarkup: ReadonlyMap<string, string>,
): () => void {
  if (!isBookServingAvailable()) return () => {}
  const onMessage = (event: MessageEvent) => {
    if (!isBookFileRequest(event.data)) return
    const port = event.ports[0]
    if (!port) return
    void answerBookFile(book, bookId, allowScripts, sectionMarkup, event.data).then((reply) => {
      if (reply.ok) port.postMessage(reply, [reply.bytes])
      else port.postMessage(reply)
    })
  }
  navigator.serviceWorker.addEventListener('message', onMessage)
  return () => navigator.serviceWorker.removeEventListener('message', onMessage)
}
