// @vitest-environment jsdom
import { beforeEach, expect, test } from 'vitest'
import { decodePayload } from '../src/lib/payload'
import { readPayloadPosition, writePayloadPosition } from '../src/lib/storage/payload-position'
import { LS_PAYLOAD_POSITIONS } from '../src/lib/storage/keys'

test('decodePayload turns base64 into an EPUB-typed file', async () => {
  const bytes = new TextEncoder().encode('PK\x03\x04 fake zip bytes')
  const base64 = btoa(String.fromCharCode(...bytes))
  const file = decodePayload(base64)
  expect(file.type).toBe('application/epub+zip')
  // Compared as plain arrays: jsdom's arrayBuffer() is cross-realm, and
  // typed-array toEqual compares constructors.
  expect(Array.from(new Uint8Array(await file.arrayBuffer()))).toEqual(Array.from(bytes))
})

test('decodePayload tolerates whitespace in the slot content', () => {
  const base64 = btoa('abc')
  expect(decodePayload(`\n  ${base64}\n`).size).toBe(3)
})

test('decodePayload throws on content that is not base64', () => {
  expect(() => decodePayload('not*base64!')).toThrow()
})

beforeEach(() => {
  localStorage.clear()
})

test('payload positions round-trip under the dedicated key, not the library', () => {
  expect(readPayloadPosition('hash-1')).toBeNull()
  writePayloadPosition('hash-1', 'epubcfi(/6/4!/4:0)')
  expect(readPayloadPosition('hash-1')).toBe('epubcfi(/6/4!/4:0)')
  const raw = JSON.parse(localStorage.getItem(LS_PAYLOAD_POSITIONS) ?? '{}')
  expect(raw['hash-1']).toBe('epubcfi(/6/4!/4:0)')
})

test('corrupt stored positions fall back to null', () => {
  localStorage.setItem(LS_PAYLOAD_POSITIONS, '{broken')
  expect(readPayloadPosition('hash-1')).toBeNull()
})
