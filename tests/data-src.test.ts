// @vitest-environment jsdom
import { expect, test, vi } from 'vitest'
import { resolveBookHref, rewriteDataSrcMarkup } from '../src/lib/scripting/data-src'

const XHTML = 'application/xhtml+xml'
const SECTION = 'OEBPS/Text/chapter.xhtml'

const xhtmlDocument = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title></head><body>${body}</body></html>`

const files: Record<string, string> = {
  'OEBPS/Audio/tone.wav': 'blob:reader/tone',
  'OEBPS/Misc/bricks/core.mpd': 'blob:reader/core',
}
const urlFor = async (href: string) => files[href] ?? null

test('resolves a data-src against its section', () => {
  expect(resolveBookHref('../Misc/bricks/core.mpd', SECTION)).toBe('OEBPS/Misc/bricks/core.mpd')
  expect(resolveBookHref('../Audio/my%20clip.mp3', SECTION)).toBe('OEBPS/Audio/my clip.mp3')
})

test('rewrites a clip span and any other element naming a book file', async () => {
  const output = await rewriteDataSrcMarkup(
    xhtmlDocument(
      '<span class="clip" data-src="../Audio/tone.wav">a</span>' +
        '<div class="bricks"><span class="bricks-library" data-src="../Misc/bricks/core.mpd" hidden="hidden"></span></div>',
    ),
    XHTML,
    SECTION,
    urlFor,
  )
  expect(output).toContain('data-src="blob:reader/tone"')
  expect(output).toContain('data-src="blob:reader/core"')
})

test('leaves values with a scheme, several tokens, or no file in the book', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const input = xhtmlDocument(
    '<span data-src="https://example.com/a.mp3">a</span>' +
      '<span data-src="../Audio/tone.wav ../Misc/bricks/core.mpd">b</span>' +
      '<span data-src="../Audio/missing.mp3">c</span>',
  )
  const output = await rewriteDataSrcMarkup(input, XHTML, SECTION, urlFor)
  expect(output).toBe(input)
  expect(warn).toHaveBeenCalledTimes(1)
  expect(String(warn.mock.calls[0][0])).toContain('OEBPS/Audio/missing.mp3')
  warn.mockRestore()
})

test('returns markup without a data-src unchanged, and skips SVG', async () => {
  const input = xhtmlDocument('<p>No references.</p>')
  expect(await rewriteDataSrcMarkup(input, XHTML, SECTION, urlFor)).toBe(input)
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><image data-src="../Audio/tone.wav"/></svg>'
  expect(await rewriteDataSrcMarkup(svg, 'image/svg+xml', SECTION, urlFor)).toBe(svg)
})
