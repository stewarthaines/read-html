import { expect, test, type Page } from '@playwright/test'

// docs/SPEC.md, "A catalog keeps its address, and Back returns to it".
const FIXTURES = 'http://127.0.0.1:4174'
const CATALOG_URL = `${FIXTURES}/catalog.xml`
const BOOK_URL = `${FIXTURES}/basic-ltr.epub`

const address = (page: Page) => new URL(page.url())
const catalogHeading = (page: Page) => page.getByRole('heading', { name: 'Fixture Catalog' })
const chapterOne = (page: Page) =>
  page.frameLocator('iframe').getByRole('heading', { name: 'Chapter One' })

async function addCatalogFromSources(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Sources' }).click()
  const drawer = page.getByRole('dialog', { name: 'Sources' })
  await drawer.getByLabel('Add a catalog by URL').fill(CATALOG_URL)
  await drawer.getByRole('button', { name: 'Add' }).click()
  await expect(catalogHeading(page)).toBeVisible()
}

async function openBasicFromCatalog(page: Page): Promise<void> {
  const entry = page.getByRole('listitem').filter({ hasText: 'Basic LTR' })
  await entry.getByRole('button', { name: 'Download' }).click()
  await entry.getByRole('button', { name: 'Open' }).click()
  await expect(chapterOne(page)).toBeVisible()
}

test('a catalog opened from the sources pane shows in the address and survives a reload', async ({
  page,
}) => {
  await addCatalogFromSources(page)
  expect(address(page).searchParams.get('catalog')).toBe(CATALOG_URL)
  await page.reload()
  await expect(catalogHeading(page)).toBeVisible()
  expect(address(page).searchParams.get('catalog')).toBe(CATALOG_URL)

  // Back to the library: the bare address.
  await page.getByRole('button', { name: 'Library' }).click()
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible()
  expect(address(page).search).toBe('')
})

test('Back from a book opened in a catalog returns to the catalog, and Forward reopens it', async ({
  page,
}) => {
  await addCatalogFromSources(page)
  await openBasicFromCatalog(page)
  expect(address(page).searchParams.get('book')).toBe(BOOK_URL)

  await page.goBack()
  await expect(catalogHeading(page)).toBeVisible()
  expect(address(page).searchParams.get('catalog')).toBe(CATALOG_URL)
  expect(address(page).searchParams.get('book')).toBeNull()

  await page.goForward()
  await expect(chapterOne(page)).toBeVisible()
  expect(address(page).searchParams.get('book')).toBe(BOOK_URL)
})

test('the reader’s Library button returns to the catalog the book came from', async ({ page }) => {
  await addCatalogFromSources(page)
  await openBasicFromCatalog(page)
  await page.getByRole('button', { name: 'Library' }).click()
  await expect(catalogHeading(page)).toBeVisible()
  expect(address(page).searchParams.get('catalog')).toBe(CATALOG_URL)
})

test('a book opened from the library adds no history entry', async ({ page }) => {
  await addCatalogFromSources(page)
  await openBasicFromCatalog(page)
  await page.getByRole('button', { name: 'Library' }).click()
  await page.getByRole('button', { name: 'Library' }).click()
  const length = await page.evaluate(() => history.length)
  await page.getByRole('listitem').filter({ hasText: 'Basic LTR' }).locator('button.open').click()
  await expect(chapterOne(page)).toBeVisible()
  expect(await page.evaluate(() => history.length)).toBe(length)
  await page.getByRole('button', { name: 'Library' }).click()
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible()
})
