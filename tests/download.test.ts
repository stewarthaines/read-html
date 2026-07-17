import { expect, test } from 'vitest'
import { downloadFileName } from '../src/lib/library/download'
import type { BookRecord } from '../src/lib/storage/types'

const record = (overrides: Partial<BookRecord>): BookRecord => ({
  id: 'x',
  title: 'A Title',
  author: '',
  coverThumb: null,
  position: null,
  fraction: 0,
  lastOpened: 0,
  addedAt: 0,
  ...overrides,
})

test('uses the stored original filename verbatim', () => {
  expect(downloadFileName(record({ fileName: 'My Book (2025).epub' }))).toBe('My Book (2025).epub')
})

test('falls back to the title with an .epub extension when no filename is stored', () => {
  expect(downloadFileName(record({ title: 'The Return of Materials' }))).toBe(
    'The Return of Materials.epub',
  )
})

test('sanitizes filesystem-unsafe characters in the title fallback', () => {
  expect(downloadFileName(record({ title: 'Songs: "Repertoire"/Nanina' }))).toBe(
    'Songs Repertoire Nanina.epub',
  )
})

test('a blank title falls back to book.epub', () => {
  expect(downloadFileName(record({ title: '   ' }))).toBe('book.epub')
})

test('does not double an existing .epub extension in the fallback', () => {
  expect(downloadFileName(record({ title: 'Already.epub' }))).toBe('Already.epub')
})
