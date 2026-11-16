// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { chapterIndex, parsePlaceFragment, resolvePlace } from '../src/lib/reader/place-link'

const doc = (html: string) => new DOMParser().parseFromString(html, 'text/html')

const sections = [
  {
    id: 'OEBPS/Text/wells_research.xhtml',
    createDocument: async () => doc('<p id="letter">x</p>'),
  },
  { id: 'OEBPS/Text/william_wells.xhtml', createDocument: async () => doc('<h2 id="bail">y</h2>') },
  { id: 'OEBPS/a/notes.xhtml', createDocument: async () => doc('') },
  { id: 'OEBPS/b/notes.xhtml', createDocument: async () => doc('') },
]

describe('parsePlaceFragment', () => {
  it('reads nothing from an empty fragment', () => {
    expect(parsePlaceFragment('')).toBeNull()
    expect(parsePlaceFragment('#')).toBeNull()
  })

  it('reads a chapter, and a chapter with an element id', () => {
    expect(parsePlaceFragment('#wells_research')).toEqual({ chapter: 'wells_research' })
    expect(parsePlaceFragment('#wells_research/letter')).toEqual({
      chapter: 'wells_research',
      id: 'letter',
    })
  })

  it('keeps everything after the first slash as the id', () => {
    expect(parsePlaceFragment('#ch/a/b')).toEqual({ chapter: 'ch', id: 'a/b' })
  })

  it('percent-decodes once', () => {
    expect(parsePlaceFragment('#caf%C3%A9/fig%201')).toEqual({ chapter: 'café', id: 'fig 1' })
    expect(parsePlaceFragment('#ch/a%2520b')).toEqual({ chapter: 'ch', id: 'a%20b' })
  })

  it('reads a CFI whole', () => {
    expect(parsePlaceFragment('#epubcfi(/6/4!/4/2[letter])')).toEqual({
      cfi: 'epubcfi(/6/4!/4/2[letter])',
    })
    expect(parsePlaceFragment('#epubcfi(%2F6%2F4!%2F4)')).toEqual({ cfi: 'epubcfi(/6/4!/4)' })
  })

  it('keeps a fragment that cannot be decoded as written, so it is simply not found', () => {
    expect(parsePlaceFragment('#bad%E0')).toEqual({ chapter: 'bad%E0' })
  })
})

describe('chapterIndex', () => {
  it('matches the file name without its extension, in any folder', () => {
    expect(chapterIndex(sections, 'william_wells')).toBe(1)
  })

  it('finds nothing for an unknown or ambiguous name', () => {
    expect(chapterIndex(sections, 'nope')).toBe(-1)
    expect(chapterIndex(sections, 'notes')).toBe(-1)
    expect(chapterIndex(sections, 'william_wells.xhtml')).toBe(-1)
  })
})

describe('resolvePlace', () => {
  const view = (cfiIndex?: number) => ({
    book: { sections },
    resolveNavigation: () => (cfiIndex === undefined ? undefined : { index: cfiIndex }),
  })

  it('goes to a chapter by its href, and to an element by href and id', async () => {
    expect(await resolvePlace(view(), { chapter: 'wells_research' })).toBe(
      'OEBPS/Text/wells_research.xhtml',
    )
    expect(await resolvePlace(view(), { chapter: 'william_wells', id: 'bail' })).toBe(
      'OEBPS/Text/william_wells.xhtml#bail',
    )
  })

  it('finds nothing for an id that is not in the named chapter', async () => {
    expect(await resolvePlace(view(), { chapter: 'wells_research', id: 'bail' })).toBeNull()
    expect(await resolvePlace(view(), { chapter: 'notes', id: 'x' })).toBeNull()
  })

  it('passes a CFI on when it names one of the book’s sections', async () => {
    const cfi = 'epubcfi(/6/4!/4)'
    expect(await resolvePlace(view(1), { cfi })).toBe(cfi)
    expect(await resolvePlace(view(-1), { cfi })).toBeNull()
    expect(await resolvePlace(view(9), { cfi })).toBeNull()
    expect(await resolvePlace(view(), { cfi })).toBeNull()
  })
})
