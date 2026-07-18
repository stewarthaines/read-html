import { expect, test } from '@playwright/test'
import { BASIC_LTR } from './helpers'

// Simulates an iOS-16-era browser (iPhone 8): the app's polyfill (src/lib/
// polyfills.ts) must restore Object.groupBy / Map.groupBy so epub.js can parse
// metadata and a book still opens. Without the polyfill this reproduces the
// reported "undefined is not a function (near '...Object.groupBy...')".
test('a book opens when Object.groupBy / Map.groupBy are absent (older Safari)', async ({
  page,
}) => {
  await page.addInitScript(() => {
    // Delete the native methods before any app code runs; the polyfill,
    // imported first in main.ts, will reinstall its fallback.
    delete (Object as { groupBy?: unknown }).groupBy
    delete (Map as { groupBy?: unknown }).groupBy
  })

  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))

  await page.goto('/')
  await page.setInputFiles('input[type=file]', BASIC_LTR)
  await expect(
    page.frameLocator('iframe[title="Book content"]').getByRole('heading', { name: 'Chapter One' }),
  ).toBeVisible()

  expect(errors.filter((e) => /groupBy/.test(e))).toEqual([])
})
