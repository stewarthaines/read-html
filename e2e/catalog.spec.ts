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

test('adding a catalog from the sources pane browses it in the main area', async ({ page }) => {
  await page.goto('/')
  const drawer = await openSources(page)
  await drawer.getByLabel('Add a catalog by URL').fill(CATALOG_URL)
  await drawer.getByRole('button', { name: 'Add' }).click()
  // Feed renders in the main area; the drawer closed.
  await expect(page.getByRole('heading', { name: 'Fixture Catalog' })).toBeVisible()
  await expect(drawer).not.toBeVisible()
  await expect(page.getByText('Spaces In Name')).toBeVisible()
  await expect(page.getByText('Clips Book')).toBeVisible()
  await expect(page.locator('img.cover')).toBeVisible()
})

test('the back button returns from a feed to the library collection', async ({ page }) => {
  await loadFixtureCatalog(page)
  // The feed's bar shows a back button (labelled Library, like the reader).
  await page.getByRole('button', { name: 'Library' }).click()
  // Home: the bar reads "Library" and the file picker is the collection's control.
  await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible()
  await expect(page.getByText('Open a book')).toBeVisible()
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
  // Trust controls appear on the active catalog, so open the pane while browsing
  // it, check trust, and close back to the same feed.
  const drawer = await openSources(page)
  await drawer.getByRole('checkbox', { name: 'Trust books from this catalog' }).check()
  await drawer.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('heading', { name: 'Fixture Catalog' })).toBeVisible()

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

test('?catalog= deep link browses the feed on load and saves the catalog', async ({ page }) => {
  await page.goto(`/?catalog=${encodeURIComponent(CATALOG_URL)}`)
  await expect(page.getByRole('heading', { name: 'Fixture Catalog' })).toBeVisible()
  await expect(page.getByText('Spaces In Name')).toBeVisible()
  expect(new URL(page.url()).search).toBe('')

  // The deep-linked catalog is persisted: it survives a reload as a saved source.
  await page.reload()
  const drawer = await openSources(page)
  await expect(drawer.getByRole('button', { name: 'Fixture Catalog', exact: true })).toBeVisible()
})

test('?book= deep link fetches and opens an EPUB, %20 included', async ({ page }) => {
  await page.goto(`/?book=${encodeURIComponent(`${FIXTURES}/spaces%20in%20name.epub`)}`)
  const section = page.frameLocator('iframe')
  await expect(section.getByRole('heading', { name: 'Chapter One' })).toBeVisible()
  expect(new URL(page.url()).search).toBe('')
  await page.getByRole('button', { name: 'Library' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Spaces In Name' })).toBeVisible()
})

test('a ?book= link keeps its URL and offers the book to the editor', async ({ page }) => {
  const bookUrl = `${FIXTURES}/basic-ltr.epub`
  await page.goto(`/?book=${encodeURIComponent(bookUrl)}`)
  await expect(
    page.frameLocator('iframe').getByRole('heading', { name: 'Chapter One' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Settings' }).click()
  const edit = page.getByRole('dialog', { name: 'Settings' }).getByRole('link', {
    name: 'Edit in SEED.html',
  })
  await expect(edit).toHaveAttribute(
    'href',
    `https://readitinabook.com/SEED.html?book=${encodeURIComponent(bookUrl)}`,
  )
})

test('a book opened from disk offers no editor link', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('input[type=file]', 'fixtures/build/basic-ltr.epub')
  await expect(
    page.frameLocator('iframe').getByRole('heading', { name: 'Chapter One' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(
    page.getByRole('dialog', { name: 'Settings' }).getByRole('link', { name: 'Edit in SEED.html' }),
  ).toHaveCount(0)
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
  // The sources pane is reachable while browsing (its menu stays in the bar).
  await openSources(page)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})

test('the sources pane shows trust and removal only on the active catalog', async ({ page }) => {
  await loadFixtureCatalog(page)
  const drawer = await openSources(page)
  const active = drawer.getByRole('listitem').filter({ hasText: 'Fixture Catalog' })
  // The browsed catalog is marked active and carries its trust + remove controls.
  await expect(active).toHaveAttribute('aria-current', 'true')
  await expect(
    active.getByRole('checkbox', { name: 'Trust books from this catalog' }),
  ).toBeVisible()
  await expect(active.getByRole('button', { name: 'Remove Fixture Catalog' })).toBeVisible()

  // Return to the collection: with nothing active, those controls disappear.
  await drawer.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: 'Library' }).click()
  const home = await openSources(page)
  await expect(home.getByRole('checkbox', { name: 'Trust books from this catalog' })).toHaveCount(0)
  await expect(home.getByRole('button', { name: 'Remove Fixture Catalog' })).toHaveCount(0)
  // The catalog is still listed and can be re-opened.
  await expect(home.getByRole('button', { name: 'Fixture Catalog', exact: true })).toBeVisible()
})

test('a book already in the library shows Open instead of Download', async ({ page }) => {
  // Acquire "Basic LTR" from the feed; it lands in the library keyed by its
  // dc:identifier, which the catalog entry also carries.
  await loadFixtureCatalog(page)
  const basic = page.getByRole('listitem').filter({ hasText: 'Basic LTR' })
  await basic.getByRole('button', { name: 'Download' }).click()
  await expect(
    page.frameLocator('iframe').getByRole('heading', { name: 'Chapter One' }),
  ).toBeVisible()

  // Re-open the same catalog: the held book now offers Open, not Download.
  await page.getByRole('button', { name: 'Library' }).click()
  await loadFixtureCatalog(page)
  const heldEntry = page.getByRole('listitem').filter({ hasText: 'Basic LTR' })
  await expect(heldEntry.getByRole('button', { name: 'Open' })).toBeVisible()
  await expect(heldEntry.getByRole('button', { name: 'Download' })).not.toBeVisible()

  // Open re-opens the held copy from the library.
  await heldEntry.getByRole('button', { name: 'Open' }).click()
  await expect(
    page.frameLocator('iframe').getByRole('heading', { name: 'Chapter One' }),
  ).toBeVisible()
})

const RICH_URL = `${FIXTURES}/catalog-rich.xml`

async function loadRichCatalog(page: Page) {
  await page.goto('/')
  const drawer = await openSources(page)
  await drawer.getByLabel('Add a catalog by URL').fill(RICH_URL)
  await drawer.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByRole('heading', { name: 'Rich Catalog' })).toBeVisible()
}

test('a multi-format entry downloads the EPUB, not another format', async ({ page }) => {
  await loadRichCatalog(page)
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Multi Format Book' })
    .getByRole('button', { name: 'Download' })
    .click()
  await expect(
    page.frameLocator('iframe').getByRole('heading', { name: 'Chapter One' }),
  ).toBeVisible()
})

test('entries we cannot acquire in-app are shown disabled with a reason', async ({ page }) => {
  await loadRichCatalog(page)
  const kindle = page
    .getByRole('listitem')
    .filter({ hasText: 'Kindle Only Book' })
    .getByRole('button', { name: 'Kindle' })
  await expect(kindle).toBeVisible()
  await expect(kindle).toBeDisabled()
  const buy = page
    .getByRole('listitem')
    .filter({ hasText: 'For Sale Book' })
    .getByRole('button', { name: 'Buy' })
  await expect(buy).toBeDisabled()
})

test('a teaser entry auto-resolves to its EPUB and opens it', async ({ page }) => {
  await loadRichCatalog(page)
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Teaser Book' })
    .getByRole('button', { name: 'Download' })
    .click()
  await expect(
    page.frameLocator('iframe').getByRole('heading', { name: 'Chapter One' }),
  ).toBeVisible()
})

test('a newer catalog version shows Update available and replaces the held copy', async ({
  page,
}) => {
  // Hold version one (imported from disk carries its dcterms:modified).
  await page.goto('/')
  await page.setInputFiles('input[type=file]', 'fixtures/build/versioned-v1.epub')
  await expect(
    page.frameLocator('iframe').getByRole('heading', { name: 'Version One' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Library' }).click()

  // The rich catalog advertises a newer version of the same publication.
  await loadRichCatalog(page)
  const versioned = page.getByRole('listitem').filter({ hasText: 'Versioned Book' })
  await versioned.getByRole('button', { name: 'Update available' }).click()

  // The updated content opens, and the library holds a single (replaced) copy.
  await expect(
    page.frameLocator('iframe').getByRole('heading', { name: 'Version Two' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Library' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Versioned Book' })).toHaveCount(1)
})
