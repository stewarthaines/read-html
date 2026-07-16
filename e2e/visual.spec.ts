import { expect, test } from '@playwright/test'

// Visual baselines are generated inside the CI-matching Linux image
// (npm run test:e2e:update) — font rendering differs across platforms, so
// these specs run only on Linux (CI and the Docker runners). BOOTSTRAP §0.
test.skip(process.platform !== 'linux', 'visual baselines are Linux-only')

test('reader: chapter one, first page', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('input[type=file]', 'fixtures/build/basic-ltr.epub')
  const section = page.frameLocator('iframe')
  await expect(section.getByRole('heading', { name: 'Chapter One' })).toBeVisible()
  await expect(page).toHaveScreenshot('reader-chapter-one.png')
})
