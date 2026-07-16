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

test('reader: dark theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await openFixture(page)
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('dark')
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page).toHaveScreenshot('reader-dark.png')
})

test('reader: scrolled flow', async ({ page }) => {
  await openFixture(page)
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('combobox', { name: 'Reading mode' }).selectOption('scrolled')
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page).toHaveScreenshot('reader-scrolled.png')
})

test('reader: RTL book, first page', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('input[type=file]', 'fixtures/build/rtl-book.epub')
  await expect(
    page.frameLocator('iframe').getByRole('heading', { name: 'الفصل الأول' }),
  ).toBeVisible()
  await expect(page).toHaveScreenshot('reader-rtl.png')
})

test('catalog: fixture feed loaded', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Catalogs' }).click()
  await page.getByLabel('Add a catalog by URL').fill('http://127.0.0.1:4174/catalog.xml')
  await page.getByRole('button', { name: 'Open catalog' }).click()
  await expect(page.getByRole('heading', { name: 'Fixture Catalog' })).toBeVisible()
  await expect(page.locator('img.cover')).toBeVisible()
  await expect(page).toHaveScreenshot('catalog-feed.png')
})

test('library: one imported book', async ({ page }) => {
  await openFixture(page)
  await page.getByRole('button', { name: 'Library' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Basic LTR' })).toBeVisible()
  await expect(page).toHaveScreenshot('library-one-book.png')
})
