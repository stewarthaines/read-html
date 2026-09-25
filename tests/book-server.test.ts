// @vitest-environment jsdom
import { expect, test } from 'vitest'
import {
  BOOK_ROUTE,
  answerBookFile,
  bookRoutePath,
  type ServedBook,
} from '../src/lib/reader/book-server'

const XHTML = 'application/xhtml+xml'
const ID = 'a'.repeat(64)

test('builds the served path from the book id and a container path, encoding segments', () => {
  expect(bookRoutePath(ID, 'OEBPS/text/ch 1.xhtml', 'http://localhost:5173')).toBe(
    `http://localhost:5173${BOOK_ROUTE}${ID}/OEBPS/text/ch%201.xhtml`,
  )
  expect(bookRoutePath('id', './OEBPS//a.png')).toBe(`${BOOK_ROUTE}id/OEBPS/a.png`)
})

const scripted =
  '<html xmlns="http://www.w3.org/1999/xhtml"><head><script src="p.js"/></head><body onload="go()"><p>x</p></body></html>'
const files: Record<string, Blob> = {
  'OEBPS/video/clip.mp4': new Blob([new Uint8Array([0, 1, 2, 3])]),
  'OEBPS/text/ch1.xhtml': new Blob([scripted]),
}
const book: ServedBook = {
  loadBlob: async (href) => files[href] ?? null,
  resources: {
    manifest: [
      { href: 'OEBPS/video/clip.mp4', mediaType: 'video/mp4' },
      { href: 'OEBPS/text/ch1.xhtml', mediaType: XHTML },
    ],
  },
}
const ask = (path: string, workspaceId = ID) => ({ type: 'book-file' as const, workspaceId, path })
const none = new Map<string, string>()

test('answers with the bytes and the manifest media type', async () => {
  const reply = await answerBookFile(book, ID, true, none, ask('OEBPS/video/clip.mp4'))
  expect(reply.ok).toBe(true)
  if (!reply.ok) return
  expect(reply.contentType).toBe('video/mp4')
  expect(Array.from(new Uint8Array(reply.bytes))).toEqual([0, 1, 2, 3])
})

test('tells the worker whether the miss is final', async () => {
  expect(await answerBookFile(book, ID, true, none, ask('OEBPS/missing.png'))).toEqual({
    ok: false,
    reason: 'not-found',
  })
  expect(await answerBookFile(book, ID, true, none, ask('OEBPS/video/clip.mp4', 'other'))).toEqual({
    ok: false,
    reason: 'not-mine',
  })
})

test('serves markup as the frames get it: stripped without consent, whole with it', async () => {
  const text = async (allow: boolean) => {
    const reply = await answerBookFile(book, ID, allow, none, ask('OEBPS/text/ch1.xhtml'))
    if (!reply.ok) throw new Error('expected ok')
    expect(reply.contentType).toBe(XHTML)
    return new TextDecoder().decode(reply.bytes)
  }
  const stripped = await text(false)
  expect(stripped).not.toContain('script')
  expect(stripped).not.toContain('onload')
  expect(stripped).toContain('<p>x</p>')
  expect(await text(true)).toBe(scripted)
})

test('answers a section the engine has prepared with that markup, whatever consent says', async () => {
  const prepared = new Map([['OEBPS/text/ch1.xhtml', '<html><body><p>rewritten</p></body></html>']])
  const reply = await answerBookFile(book, ID, false, prepared, ask('OEBPS/text/ch1.xhtml'))
  if (!reply.ok) throw new Error('expected ok')
  expect(reply.contentType).toBe(XHTML)
  expect(new TextDecoder().decode(reply.bytes)).toContain('rewritten')
})
