import { expect, test } from 'vitest'
import type { CatalogEntry, CatalogFeed } from '../src/lib/catalog/feed'
import { findUpdates, offersUpdate } from '../src/lib/catalog/updates'
import type { BookRecord } from '../src/lib/storage/types'

const book = (overrides: Partial<BookRecord>): BookRecord => ({
  id: 'book-1',
  title: 'Book',
  author: 'Author',
  identifier: 'urn:book:1',
  modified: '2026-01-01T00:00:00Z',
  coverThumb: null,
  position: null,
  fraction: 0,
  lastOpened: 0,
  addedAt: 0,
  ...overrides,
})

const entry = (overrides: Partial<CatalogEntry>): CatalogEntry => ({
  kind: 'epub',
  title: 'Book',
  author: 'Author',
  summary: '',
  identifier: 'urn:book:1',
  version: '2026-06-01T00:00:00Z',
  href: 'https://example.org/book-v2.epub',
  coverUrl: null,
  label: null,
  ...overrides,
})

const feedOf = (url: string, entries: CatalogEntry[]): CatalogFeed => ({
  url,
  title: 'Feed',
  entries,
})

test('an entry newer than the held copy offers an update', () => {
  expect(offersUpdate('2026-06-01T00:00:00Z', book({}))).toBe(true)
  expect(offersUpdate('2025-06-01T00:00:00Z', book({}))).toBe(false)
})

test('an update already taken at that catalog version is not offered again', () => {
  // The catalog dates the entry after the EPUB's own modified date.
  const taken = book({
    modified: '2026-05-31T23:59:00Z',
    catalogVersion: '2026-06-01T00:00:00Z',
  })
  expect(offersUpdate('2026-06-01T00:00:00Z', taken)).toBe(false)
  expect(offersUpdate('2026-07-01T00:00:00Z', taken)).toBe(true)
})

test('missing or unparseable dates never claim an update', () => {
  expect(offersUpdate(null, book({}))).toBe(false)
  expect(offersUpdate('soon', book({}))).toBe(false)
  expect(offersUpdate('2026-06-01T00:00:00Z', book({ modified: undefined }))).toBe(false)
})

test('findUpdates matches books by identifier across feeds, skipping feeds that fail', async () => {
  const books = [book({}), book({ id: 'book-2', identifier: 'urn:book:2' })]
  const feeds: Record<string, CatalogFeed> = {
    'https://a.example/feed': feedOf('https://a.example/feed', [
      entry({}),
      entry({ identifier: 'urn:book:2', version: '2020-01-01T00:00:00Z' }),
      entry({ kind: 'feed', identifier: 'urn:book:2' }),
    ]),
  }
  const load = (url: string) =>
    feeds[url] ? Promise.resolve(feeds[url]) : Promise.reject(new Error('offline'))
  const updates = await findUpdates(
    books,
    ['https://a.example/feed', 'https://down.example/feed'],
    load,
  )
  expect([...updates.keys()]).toEqual(['book-1'])
  expect(updates.get('book-1')).toEqual({
    href: 'https://example.org/book-v2.epub',
    version: '2026-06-01T00:00:00Z',
    feedUrl: 'https://a.example/feed',
  })
})

test('findUpdates loads each feed once and keeps the newest of two offers', async () => {
  const loaded: string[] = []
  const feeds: Record<string, CatalogFeed> = {
    one: feedOf('one', [entry({ version: '2026-03-01T00:00:00Z', href: 'old.epub' })]),
    two: feedOf('two', [entry({ version: '2026-09-01T00:00:00Z', href: 'new.epub' })]),
  }
  const load = (url: string) => {
    loaded.push(url)
    return Promise.resolve(feeds[url])
  }
  const updates = await findUpdates([book({})], ['one', 'two', 'one'], load)
  expect(loaded).toEqual(['one', 'two'])
  expect(updates.get('book-1')?.href).toBe('new.epub')
})
