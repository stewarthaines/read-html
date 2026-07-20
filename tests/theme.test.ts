import { expect, test } from 'vitest'
import { bookContentCss } from '../src/lib/theme/book'

test('book CSS carries the font-size percentage', () => {
  const css = bookContentCss({ flow: 'paginated', spread: 'auto', fontSize: 130, theme: 'auto' })
  expect(css).toContain('font-size: 130%')
})

test('auto theme leaves both schemes enabled', () => {
  expect(
    bookContentCss({ flow: 'paginated', spread: 'auto', fontSize: 100, theme: 'auto' }),
  ).toContain('color-scheme: light dark')
})

test('manual themes constrain the scheme, and never use filters', () => {
  const dark = bookContentCss({ flow: 'paginated', spread: 'auto', fontSize: 100, theme: 'dark' })
  expect(dark).toContain('color-scheme: dark')
  expect(dark).not.toContain('filter')
  expect(
    bookContentCss({ flow: 'paginated', spread: 'auto', fontSize: 100, theme: 'light' }),
  ).toContain('color-scheme: light')
})
