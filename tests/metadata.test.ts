// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, expect, test } from 'vitest'
import { deleteBook, getBook, listBooks, putBook, updateBook } from '../src/lib/storage/metadata'
import type { BookRecord } from '../src/lib/storage/types'

const record = (overrides: Partial<BookRecord> = {}): BookRecord => ({
  id: 'id-1',
  title: 'A Title',
  author: 'An Author',
  coverThumb: null,
  position: null,
  fraction: 0,
  lastOpened: 1000,
  addedAt: 1000,
  ...overrides,
})

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

test('put/get round-trips a record; missing id resolves undefined', async () => {
  await putBook(record())
  expect(await getBook('id-1')).toMatchObject({ title: 'A Title', author: 'An Author' })
  expect(await getBook('nope')).toBeUndefined()
})

test('CFI position string survives persistence verbatim', async () => {
  const cfi = 'epubcfi(/6/4!/4/10/2[para05]/3:10)'
  await putBook(record({ position: cfi, fraction: 0.42 }))
  const stored = await getBook('id-1')
  expect(stored?.position).toBe(cfi)
  expect(stored?.fraction).toBe(0.42)
})

test('cover thumbnail blob round-trips with its media type', async () => {
  const thumb = new Blob(['<svg/>'], { type: 'image/svg+xml' })
  await putBook(record({ coverThumb: thumb }))
  const stored = await getBook('id-1')
  expect(stored?.coverThumb?.type).toBe('image/svg+xml')
  expect(await stored?.coverThumb?.text()).toBe('<svg/>')
})

test('listBooks orders by lastOpened, most recent first', async () => {
  await putBook(record({ id: 'older', lastOpened: 100 }))
  await putBook(record({ id: 'newest', lastOpened: 300 }))
  await putBook(record({ id: 'middle', lastOpened: 200 }))
  expect((await listBooks()).map((b) => b.id)).toEqual(['newest', 'middle', 'older'])
})

test('updateBook patches fields and leaves the rest intact', async () => {
  await putBook(record({ title: 'Keep me' }))
  await updateBook('id-1', { position: 'epubcfi(/6/2!/4:0)', fraction: 0.5, lastOpened: 2000 })
  const stored = await getBook('id-1')
  expect(stored?.title).toBe('Keep me')
  expect(stored?.position).toBe('epubcfi(/6/2!/4:0)')
  expect(stored?.lastOpened).toBe(2000)
})

test('updateBook of an unknown id is a no-op', async () => {
  await expect(updateBook('nope', { fraction: 1 })).resolves.toBeUndefined()
  expect(await getBook('nope')).toBeUndefined()
})

test('deleteBook removes the record', async () => {
  await putBook(record())
  await deleteBook('id-1')
  expect(await getBook('id-1')).toBeUndefined()
})
