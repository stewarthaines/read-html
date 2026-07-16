// @vitest-environment jsdom
import { expect, test } from 'vitest'
import { STRIPPABLE_TYPES, stripScripts } from '../src/lib/scripting/strip'

const XHTML = 'application/xhtml+xml'

const xhtmlDocument = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title></head><body>${body}</body></html>`

test('removes external and inline script elements from XHTML', () => {
  const input = xhtmlDocument(
    '<p>Keep me.</p><script src="player.js"></script><script>localStorage.setItem("x", "y")</script>',
  )
  const output = stripScripts(input, XHTML)
  expect(output).not.toContain('script')
  expect(output).toContain('Keep me.')
})

test('removes on* event-handler attributes, preserving the element and other attributes', () => {
  const input = xhtmlDocument(
    '<p onclick="evil()" class="clip" data-src="audio/tone.wav">Click label</p>',
  )
  const output = stripScripts(input, XHTML)
  expect(output).not.toContain('onclick')
  expect(output).toContain('class="clip"')
  expect(output).toContain('data-src="audio/tone.wav"')
  expect(output).toContain('Click label')
})

test('removes handlers from the root and body elements', () => {
  const input = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" onload="evil()"><body onunload="evil()"><p>text</p></body></html>`
  const output = stripScripts(input, XHTML)
  expect(output).not.toContain('onload')
  expect(output).not.toContain('onunload')
  expect(output).toContain('<p>text</p>')
})

test('strips script elements from SVG', () => {
  const input = `<svg xmlns="http://www.w3.org/2000/svg"><script>evil()</script><rect width="1" height="1"/></svg>`
  const output = stripScripts(input, 'image/svg+xml')
  expect(output).not.toContain('script')
  expect(output).toContain('rect')
})

test('strips scripts from text/html documents', () => {
  const input = '<html><body><script>evil()</script><p onmouseover="evil()">text</p></body></html>'
  const output = stripScripts(input, 'text/html')
  expect(output).not.toContain('script')
  expect(output).not.toContain('onmouseover')
  expect(output).toContain('text')
})

test('strippable types cover the markup types foliate parses', () => {
  expect(STRIPPABLE_TYPES).toEqual(['application/xhtml+xml', 'text/html', 'image/svg+xml'])
})
