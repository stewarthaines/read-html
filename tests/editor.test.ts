import { describe, expect, it } from 'vitest'
import { editorUrl } from '../src/lib/editor'

describe('editorUrl', () => {
  it('hands the book URL to the editor as its own ?book= deep link', () => {
    expect(editorUrl('https://example.com/a.epub')).toBe(
      'https://readitinabook.com/SEED.html?book=https%3A%2F%2Fexample.com%2Fa.epub',
    )
  })

  it('encodes a URL whose path and query would otherwise be swallowed', () => {
    const url = new URL(editorUrl('https://example.com/spaces in name.epub?v=2'))
    expect(url.searchParams.get('book')).toBe('https://example.com/spaces in name.epub?v=2')
  })
})
