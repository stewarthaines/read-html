import { expect, test } from 'vitest'
import { mapGroupBy, objectGroupBy } from '../src/lib/polyfills'

test('objectGroupBy groups items by the key function', () => {
  const grouped = objectGroupBy([1, 2, 3, 4, 5], (n) => (n % 2 ? 'odd' : 'even'))
  expect(grouped.odd).toEqual([1, 3, 5])
  expect(grouped.even).toEqual([2, 4])
})

test('objectGroupBy passes the index and returns a null-prototype object', () => {
  const grouped = objectGroupBy(['a', 'b', 'c'], (_item, i) => (i < 2 ? 'first' : 'rest'))
  expect(grouped.first).toEqual(['a', 'b'])
  expect(grouped.rest).toEqual(['c'])
  expect(Object.getPrototypeOf(grouped)).toBeNull()
})

test('objectGroupBy is safe against dangerous keys', () => {
  const grouped = objectGroupBy(['x'], () => '__proto__')
  expect(grouped['__proto__']).toEqual(['x'])
})

test('mapGroupBy groups by non-string keys, preserving key identity', () => {
  const a = { id: 1 }
  const b = { id: 2 }
  const grouped = mapGroupBy(
    [
      { g: a, v: 1 },
      { g: b, v: 2 },
      { g: a, v: 3 },
    ],
    (x) => x.g,
  )
  expect(grouped.get(a)?.map((x) => x.v)).toEqual([1, 3])
  expect(grouped.get(b)?.map((x) => x.v)).toEqual([2])
})

test('both accept any iterable, not just arrays', () => {
  const set = new Set([1, 2, 3, 4])
  expect(objectGroupBy(set, (n) => (n > 2 ? 'big' : 'small')).big).toEqual([3, 4])
  expect(mapGroupBy(set, (n) => n > 2).get(true)).toEqual([3, 4])
})
