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

test('reader: TOC drawer with long, wrapping titles', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('input[type=file]', 'fixtures/build/long-toc.epub')
  await expect(
    page.frameLocator('iframe[title="Book content"]').getByRole('heading', { level: 1 }).first(),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Contents' }).click()
  await expect(page.getByRole('dialog', { name: 'Contents' })).toBeVisible()
  await expect(page).toHaveScreenshot('toc-long-titles.png')
})

// Loads the fixture catalog feed into the library main area, settling
// everything a stable screenshot depends on: the modal fully closed, the feed
// entries present, and the cover image actually decoded.
async function loadFixtureCatalogFeed(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Sources' }).click()
  const drawer = page.getByRole('dialog', { name: 'Sources' })
  await expect(drawer).toBeVisible()
  await drawer.getByLabel('Add a catalog by URL').fill('http://127.0.0.1:4174/catalog.xml')
  await drawer.getByRole('button', { name: 'Add' }).click()
  await expect(drawer).not.toBeVisible()
  await expect(page.getByRole('heading', { name: 'Fixture Catalog' })).toBeVisible()
  await expect(page.getByText('Spaces In Name')).toBeVisible()
  await expect
    .poll(() =>
      page
        .locator('img.cover')
        .first()
        .evaluate((img) => {
          const image = img as HTMLImageElement
          return image.complete && image.naturalWidth > 0
        }),
    )
    .toBe(true)
}

test('catalog: fixture feed loaded in the main area', async ({ page }) => {
  await loadFixtureCatalogFeed(page)
  await expect(page).toHaveScreenshot('catalog-feed.png')
})

test('catalog: sources drawer open', async ({ page }) => {
  await loadFixtureCatalogFeed(page)
  // Open the pane while browsing, so the saved catalog shows as active with its
  // trust + remove controls (exact name — "Remove Fixture Catalog" also matches).
  await page.getByRole('button', { name: 'Sources' }).click()
  const drawer = page.getByRole('dialog', { name: 'Sources' })
  await expect(drawer.getByRole('button', { name: 'Fixture Catalog', exact: true })).toBeVisible()
  await expect(
    drawer.getByRole('checkbox', { name: 'Trust books from this catalog' }),
  ).toBeVisible()
  await expect(page).toHaveScreenshot('sources-drawer.png')
})

test('catalog: rich feed shows each entry kind', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Sources' }).click()
  const drawer = page.getByRole('dialog', { name: 'Sources' })
  await expect(drawer).toBeVisible()
  await drawer.getByLabel('Add a catalog by URL').fill('http://127.0.0.1:4174/catalog-rich.xml')
  await drawer.getByRole('button', { name: 'Add' }).click()
  await expect(drawer).not.toBeVisible()
  // Disabled badges (Kindle/Buy) alongside downloadable and teaser entries.
  await expect(page.getByRole('button', { name: 'Kindle' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Buy' })).toBeDisabled()
  await expect
    .poll(() =>
      page
        .locator('img.cover')
        .first()
        .evaluate((img) => {
          const image = img as HTMLImageElement
          return image.complete && image.naturalWidth > 0
        }),
    )
    .toBe(true)
  await expect(page).toHaveScreenshot('catalog-rich.png')
})

test('library: one imported book', async ({ page }) => {
  await openFixture(page)
  await page.getByRole('button', { name: 'Library' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Basic LTR' })).toBeVisible()
  await expect(page).toHaveScreenshot('library-one-book.png')
})
