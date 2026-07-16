import { expect, test } from 'vitest'
import { decideScripting } from '../src/lib/scripting/consent'

test('non-scripted books always strip, whatever the record says', () => {
  expect(decideScripting(false, undefined)).toBe('strip')
  expect(decideScripting(false, true)).toBe('strip')
  expect(decideScripting(false, false)).toBe('strip')
})

test('scripted with recorded grant runs', () => {
  expect(decideScripting(true, true)).toBe('run')
})

test('scripted with recorded denial strips', () => {
  expect(decideScripting(true, false)).toBe('strip')
})

test('scripted with no recorded answer renders stripped and asks', () => {
  expect(decideScripting(true, undefined)).toBe('ask')
})
