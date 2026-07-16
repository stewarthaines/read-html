import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const FIXTURES = 'http://127.0.0.1:4174'
const CATALOG_URL = `${FIXTURES}/catalog.xml`

async function openCatalogView(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Catalogs' }).click()
  await expect(page.getByRole('heading', { name: 'Catalogs' })).toBeVisible()
}

async function loadFixtureCatalog(page: Page) {
  await openCatalogView(page)
  await page.getByLabel('Add a catalog by URL').fill(CATALOG_URL)
  await page.getByRole('button', { name: 'Open catalog' }).click()
  await expect(page.getByRole('heading', { name: 'Fixture Catalog' })).toBeVisible()
}

test('adding a catalog by URL lists its entries with covers', async ({ page }) => {
  await loadFixtureCatalog(page)
  await expect(page.getByText('Spaces In Name')).toBeVisible()
  await expect(page.getByText('Basic LTR')).toBeVisible()
  await expect(page.getByText('Clips Book')).toBeVisible()
  // Cover thumbnail from the feed's image link — itself a %20 URL.
  await expect(page.locator('img.cover')).toBeVisible()
})

test('downloads a book with %20 in its URL and reads it end-to-end (§3.7)', async ({ page }) => {
  await loadFixtureCatalog(page)
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Spaces In Name' })
    .getByRole('button', { name: 'Download' })
    .click()
  const section = page.frameLocator('iframe')
  await expect(section.getByRole('heading', { name: 'Chapter One' })).toBeVisible()

  // Internal hrefs with %20 resolve too: navigate via the TOC.
  await page.getByRole('button', { name: 'Contents' }).click()
  await page
    .getByRole('dialog', { name: 'Contents' })
    .getByRole('button', { name: 'Chapter Two' })
    .click()
  await expect(section.getByRole('heading', { name: 'Chapter Two' })).toBeVisible()

  // It landed in the library.
  await page.getByRole('button', { name: 'Library' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Spaces In Name' })).toBeVisible()
})

test('a non-CORS catalog produces a friendly error naming CORS', async ({ page }) => {
  await openCatalogView(page)
  await page.getByLabel('Add a catalog by URL').fill(`${FIXTURES}/no-cors/catalog.xml`)
  await page.getByRole('button', { name: 'Open catalog' }).click()
  await expect(page.getByRole('alert')).toContainText('CORS')
})

test('trusted catalog auto-consents downloaded books (§3.4 step 4)', async ({ page }) => {
  await loadFixtureCatalog(page)
  // Back to the saved list to enable trust for this catalog.
  await page.getByRole('button', { name: 'Back' }).click()
  await page.getByRole('checkbox', { name: 'Trust books from this catalog' }).check()
  await page.getByRole('button', { name: 'Fixture Catalog', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Fixture Catalog' })).toBeVisible()

  await page
    .getByRole('listitem')
    .filter({ hasText: 'Clips Book' })
    .getByRole('button', { name: 'Download' })
    .click()
  const section = page.frameLocator('iframe')
  await expect(section.getByRole('heading', { name: 'Clips Chapter' })).toBeVisible()
  // No consent prompt, and the book's script runs (it primes the audio
  // element with a blob: URL at startup).
  await expect(page.getByRole('dialog', { name: 'Interactive features' })).not.toBeVisible()
  await expect
    .poll(async () => section.locator('audio').evaluate((el) => (el as HTMLAudioElement).src))
    .toMatch(/^blob:/)
})

test('?catalog= deep link opens the browser pre-loaded', async ({ page }) => {
  await page.goto(`/?catalog=${encodeURIComponent(CATALOG_URL)}`)
  await expect(page.getByRole('heading', { name: 'Fixture Catalog' })).toBeVisible()
  await expect(page.getByText('Spaces In Name')).toBeVisible()
  // The param is consumed and cleared.
  expect(new URL(page.url()).search).toBe('')
})

test('?book= deep link fetches and opens an EPUB, %20 included', async ({ page }) => {
  await page.goto(`/?book=${encodeURIComponent(`${FIXTURES}/spaces%20in%20name.epub`)}`)
  const section = page.frameLocator('iframe')
  await expect(section.getByRole('heading', { name: 'Chapter One' })).toBeVisible()
  expect(new URL(page.url()).search).toBe('')
  await page.getByRole('button', { name: 'Library' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Spaces In Name' })).toBeVisible()
})

test('drag-and-drop imports a book on the library', async ({ page }) => {
  await page.goto('/')
  // Build a DataTransfer in the page from the fixture bytes.
  const response = await page.request.get(`${FIXTURES}/basic-ltr.epub`)
  const bytes = Array.from(new Uint8Array(await response.body()))
  const dataTransfer = await page.evaluateHandle((data) => {
    const transfer = new DataTransfer()
    transfer.items.add(
      new File([new Uint8Array(data)], 'basic-ltr.epub', { type: 'application/epub+zip' }),
    )
    return transfer
  }, bytes)
  await page.dispatchEvent('main', 'drop', { dataTransfer })
  await expect(
    page.frameLocator('iframe').getByRole('heading', { name: 'Chapter One' }),
  ).toBeVisible()
})

test('catalog view has no accessibility violations', async ({ page }) => {
  await loadFixtureCatalog(page)
  const scan = await new AxeBuilder({ page }).analyze()
  expect(scan.violations).toEqual([])
})
