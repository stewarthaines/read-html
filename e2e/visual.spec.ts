import { expect, test } from '@playwright/test'
import { openFixture } from './helpers'

// Visual baselines are generated inside the CI-matching Linux image
// (npm run test:e2e:update) — font rendering differs across platforms, so
// these specs run only on Linux (CI and the Docker runners). BOOTSTRAP §0.
test.skip(process.platform !== 'linux', 'visual baselines are Linux-only')

test('reader: chapter one, first page', async ({ page }) => {
  await openFixture(page)
  await expect(page).toHaveScreenshot('reader-chapter-one.png')
})

test('library: one imported book', async ({ page }) => {
  await openFixture(page)
  await page.getByRole('button', { name: 'Library' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Basic LTR' })).toBeVisible()
  await expect(page).toHaveScreenshot('library-one-book.png')
})
