// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { fetchFailure, parseCatalog } from '../src/lib/catalog/feed'

const FEED_URL = 'http://127.0.0.1:4174/catalog.xml'
const fixtureXml = () => readFileSync('fixtures/build/catalog.xml', 'utf8')

test('parses the fixture OPDS 1.x feed into normalized entries', () => {
  const feed = parseCatalog(fixtureXml(), FEED_URL)
  expect(feed.title).toBe('Fixture Catalog')
  expect(feed.entries.map((entry) => entry.title)).toEqual([
    'Spaces In Name',
    'Basic LTR',
    'Clips Book',
  ])
  const spaces = feed.entries[0]
  expect(spaces.kind).toBe('epub')
  expect(spaces.author).toBe('Fixture Author')
  expect(spaces.summary).toContain('spaces')
})

test('§3.7: hrefs resolve against the feed URL without re-encoding — %20 stays %20', () => {
  const feed = parseCatalog(fixtureXml(), FEED_URL)
  const spaces = feed.entries[0]
  expect(spaces.href).toBe('http://127.0.0.1:4174/spaces%20in%20name.epub')
  expect(spaces.href).not.toContain('%2520')
  expect(spaces.coverUrl).toBe('http://127.0.0.1:4174/covers/spaces%20cover.svg')
})

test('navigation entries become browsable sub-feed links', () => {
  const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Root</title>
  <entry>
    <title>Fiction</title>
    <link rel="subsection" type="application/atom+xml;profile=opds-catalog" href="fiction.xml"/>
  </entry>
</feed>`
  const feed = parseCatalog(xml, 'http://example.test/root.xml')
  expect(feed.entries).toEqual([
    expect.objectContaining({
      kind: 'feed',
      title: 'Fiction',
      href: 'http://example.test/fiction.xml',
    }),
  ])
})

test('picks the EPUB acquisition link when several formats are offered', () => {
  const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Root</title>
  <entry>
    <title>Many Formats</title>
    <link rel="http://opds-spec.org/acquisition" type="application/x-mobipocket-ebook" href="book.mobi"/>
    <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="book.epub"/>
  </entry>
</feed>`
  const feed = parseCatalog(xml, 'http://example.test/root.xml')
  expect(feed.entries[0].kind).toBe('epub')
  expect(feed.entries[0].href).toBe('http://example.test/book.epub')
})

test('a non-EPUB-only book and a buy link are unsupported, with labels', () => {
  const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opds="http://opds-spec.org/2010/catalog">
  <title>Root</title>
  <entry>
    <title>Kindle Only</title>
    <link rel="http://opds-spec.org/acquisition" type="application/x-mobipocket-ebook" href="book.mobi"/>
  </entry>
  <entry>
    <title>For Sale</title>
    <link rel="http://opds-spec.org/acquisition/buy" type="application/epub+zip" href="buy"/>
  </entry>
</feed>`
  const [kindle, sale] = parseCatalog(xml, 'http://example.test/root.xml').entries
  expect(kindle).toMatchObject({ kind: 'unsupported', label: 'Kindle', href: '' })
  expect(sale).toMatchObject({ kind: 'unsupported', label: 'Buy' })
})

test('a partial entry (cover + detail link, no acquisition) is a teaser', () => {
  const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Search Results</title>
  <entry>
    <title>Moby Dick</title>
    <content type="text">Herman Melville</content>
    <link rel="subsection" type="application/atom+xml;profile=opds-catalog" href="2701.xml"/>
    <link rel="http://opds-spec.org/image/thumbnail" type="image/jpeg" href="covers/2701.jpg"/>
  </entry>
</feed>`
  const feed = parseCatalog(xml, 'http://example.test/search.xml')
  expect(feed.entries[0]).toMatchObject({
    kind: 'teaser',
    title: 'Moby Dick',
    href: 'http://example.test/2701.xml',
    coverUrl: 'http://example.test/covers/2701.jpg',
  })
})

test('an entry exposes its version from dcterms:modified, else atom:updated', () => {
  const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dcterms="http://purl.org/dc/terms/">
  <title>Root</title>
  <entry>
    <title>Modified Wins</title>
    <updated>2020-01-01T00:00:00Z</updated>
    <dcterms:modified>2024-06-01T00:00:00Z</dcterms:modified>
    <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="a.epub"/>
  </entry>
  <entry>
    <title>Updated Fallback</title>
    <updated>2021-03-03T00:00:00Z</updated>
    <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="b.epub"/>
  </entry>
</feed>`
  const [modified, updated] = parseCatalog(xml, 'http://example.test/root.xml').entries
  expect(modified.version).toBe('2024-06-01T00:00:00Z')
  expect(updated.version).toBe('2021-03-03T00:00:00Z')
})

test('fetch failures name CORS only for cross-origin URLs', () => {
  // jsdom's location is http://localhost:3000 by default under vitest.
  expect(fetchFailure('http://other.example/catalog.xml', 'catalog').message).toContain('CORS')
  expect(fetchFailure(`${location.origin}/catalog.xml`, 'catalog').message).not.toContain('CORS')
  expect(fetchFailure('http://other.example/a.epub', 'book').message).toContain('CORS')
  expect(fetchFailure(`${location.origin}/a.epub`, 'book').message).not.toContain('CORS')
})

test('an OPDS 2.0 JSON feed parses through the same normalization', () => {
  const json = JSON.stringify({
    metadata: { title: 'JSON Catalog' },
    publications: [
      {
        metadata: { title: 'A Book', author: [{ name: 'Someone' }] },
        links: [
          {
            rel: 'http://opds-spec.org/acquisition/open-access',
            href: 'a%20book.epub',
            type: 'application/epub+zip',
          },
        ],
        images: [{ href: 'covers/a.png' }],
      },
    ],
  })
  const feed = parseCatalog(json, 'http://example.test/feed.json')
  expect(feed.title).toBe('JSON Catalog')
  expect(feed.entries[0].href).toBe('http://example.test/a%20book.epub')
  expect(feed.entries[0].coverUrl).toBe('http://example.test/covers/a.png')
})
