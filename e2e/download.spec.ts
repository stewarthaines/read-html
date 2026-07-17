import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { BASIC_LTR, openFixture } from './helpers'

test('downloads a library book with its original filename, byte-identical', async ({ page }) => {
  await openFixture(page)
  await page.getByRole('button', { name: 'Library' }).click()
  const card = page.getByRole('listitem').filter({ hasText: 'Basic LTR' })

  const downloadPromise = page.waitForEvent('download')
  await card.getByRole('button', { name: 'Download Basic LTR' }).click()
  const download = await downloadPromise

  // The picker's File.name is preserved.
  expect(download.suggestedFilename()).toBe('basic-ltr.epub')

  // The saved bytes are identical to the shipped fixture.
  const path = await download.path()
  expect(readFileSync(path).equals(readFileSync(BASIC_LTR))).toBe(true)
})
