// @vitest-environment jsdom
import { beforeEach, expect, test } from 'vitest'
import {
  reloadCatalogs,
  removeCatalog,
  saveCatalog,
  savedCatalogs,
  setCatalogTrust,
} from '../src/lib/catalog/saved.svelte'
import { LS_CATALOGS } from '../src/lib/storage/keys'

beforeEach(() => {
  localStorage.clear()
  reloadCatalogs()
})

test('starts empty; saving persists under the readhtml key', () => {
  expect(savedCatalogs()).toEqual([])
  saveCatalog('http://example.test/catalog.xml', 'Example')
  expect(JSON.parse(localStorage.getItem(LS_CATALOGS) ?? '[]')).toEqual([
    { url: 'http://example.test/catalog.xml', title: 'Example', trustBooks: false },
  ])
})

test('saving the same URL twice does not duplicate', () => {
  saveCatalog('http://example.test/c.xml', 'One')
  saveCatalog('http://example.test/c.xml', 'Two')
  expect(savedCatalogs()).toHaveLength(1)
  expect(savedCatalogs()[0].title).toBe('One')
})

test('trust toggles persist; remove removes', () => {
  saveCatalog('http://example.test/c.xml', 'C')
  setCatalogTrust('http://example.test/c.xml', true)
  reloadCatalogs()
  expect(savedCatalogs()[0].trustBooks).toBe(true)
  removeCatalog('http://example.test/c.xml')
  expect(savedCatalogs()).toEqual([])
})

test('corrupt stored JSON falls back to an empty list', () => {
  localStorage.setItem(LS_CATALOGS, '{nope')
  reloadCatalogs()
  expect(savedCatalogs()).toEqual([])
})

test('malformed entries are dropped, valid ones kept', () => {
  localStorage.setItem(
    LS_CATALOGS,
    JSON.stringify([{ url: 'http://ok.test/c.xml' }, { title: 'no url' }, 'junk']),
  )
  reloadCatalogs()
  expect(savedCatalogs()).toEqual([
    { url: 'http://ok.test/c.xml', title: 'http://ok.test/c.xml', trustBooks: false },
  ])
})
