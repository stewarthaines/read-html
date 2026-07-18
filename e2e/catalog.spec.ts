import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const FIXTURES = 'http://127.0.0.1:4174'
const CATALOG_URL = `${FIXTURES}/catalog.xml`

async function openSources(page: Page) {
  await page.getByRole('button', { name: 'Sources' }).click()
  const drawer = page.getByRole('dialog', { name: 'Sources' })
  await expect(drawer).toBeVisible()
  return drawer
}

async function loadFixtureCatalog(page: Page) {
  await page.goto('/')
  const drawer = await openSources(page)
  await drawer.getByLabel('Add a catalog by URL').fill(CATALOG_URL)
  await drawer.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByRole('heading', { name: 'Fixture Catalog' })).toBeVisible()
}

test('the sources pane hosts a Downloaded link and adding a catalog browses it', async ({
  page,
}) => {
  await page.goto('/')
  const drawer = await openSources(page)
  await expect(drawer.getByRole('button', { name: 'Downloaded' })).toBeVisible()
  await drawer.getByLabel('Add a catalog by URL').fill(CATALOG_URL)
  await drawer.getByRole('button', { name: 'Add' }).click()
  // Feed renders in the main area; the drawer closed.
  await expect(page.getByRole('heading', { name: 'Fixture Catalog' })).toBeVisible()
  await expect(drawer).not.toBeVisible()
  await expect(page.getByText('Spaces In Name')).toBeVisible()
  await expect(page.getByText('Clips Book')).toBeVisible()
  await expect(page.locator('img.cover')).toBeVisible()
})

test('the Downloaded link returns from a feed to the collection', async ({ page }) => {
  await loadFixtureCatalog(page)
  const drawer = await openSources(page)
  await drawer.getByRole('button', { name: 'Downloaded' }).click()
  // Back to the collection (the file picker is the collection's own control).
  await expect(page.getByRole('heading', { name: 'Open a book' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Fixture Catalog' })).not.toBeVisible()
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

  // Back to the library (reader's Library button); it landed in the collection.
  await page.getByRole('button', { name: 'Library' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Spaces In Name' })).toBeVisible()
})

test('a non-CORS catalog produces a friendly error naming CORS', async ({ page }) => {
  await page.goto('/')
  const drawer = await openSources(page)
  await drawer.getByLabel('Add a catalog by URL').fill(`${FIXTURES}/no-cors/catalog.xml`)
  await drawer.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByRole('alert')).toContainText('CORS')
})

test('trusted catalog auto-consents downloaded books (§3.4 step 4)', async ({ page }) => {
  await loadFixtureCatalog(page)
  // Trust the catalog from the sources pane; trust applies to the live feed.
  const drawer = await openSources(page)
  await drawer.getByRole('checkbox', { name: 'Trust books from this catalog' }).check()
  await drawer.getByRole('button', { name: 'Close' }).click()

  await page
    .getByRole('listitem')
    .filter({ hasText: 'Clips Book' })
    .getByRole('button', { name: 'Download' })
    .click()
  const section = page.frameLocator('iframe')
  await expect(section.getByRole('heading', { name: 'Clips Chapter' })).toBeVisible()
  // No consent prompt, and the book's script runs (it primes the audio element).
  await expect(page.getByRole('dialog', { name: 'Interactive features' })).not.toBeVisible()
  await expect
    .poll(async () => section.locator('audio').evaluate((el) => (el as HTMLAudioElement).src))
    .toMatch(/^blob:/)
})

test('?catalog= deep link browses the feed on load', async ({ page }) => {
  await page.goto(`/?catalog=${encodeURIComponent(CATALOG_URL)}`)
  await expect(page.getByRole('heading', { name: 'Fixture Catalog' })).toBeVisible()
  await expect(page.getByText('Spaces In Name')).toBeVisible()
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

test('the sources pane and a loaded feed have no accessibility violations', async ({ page }) => {
  await loadFixtureCatalog(page)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await openSources(page)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})
