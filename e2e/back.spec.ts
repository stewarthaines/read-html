import { expect, test, type Page } from '@playwright/test'

// docs/SPEC.md, "Back to where you were, and non-linear chapters".
const FIXTURES = 'http://127.0.0.1:4174'
const BOOK = `${FIXTURES}/notes-book.epub`

type ViewElement = Element & { lastLocation?: { cfi: string } }

const heading = (page: Page, name: string) =>
  page.frameLocator('iframe').getByRole('heading', { name })
const back = (page: Page) => page.getByRole('button', { name: 'Back', exact: true })
const contents = (page: Page) => page.getByRole('complementary', { name: 'Contents' })
const cfi = (page: Page) =>
  page.evaluate(
    () => (document.querySelector('foliate-view') as ViewElement | null)?.lastLocation?.cfi,
  )

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 })
  await page.goto(`/?book=${encodeURIComponent(BOOK)}`)
  await expect(heading(page, 'Chapter One')).toBeVisible()
})

test('a link into a non-linear chapter offers Back, which returns to the page it was followed from', async ({
  page,
}) => {
  await expect(back(page)).toHaveCount(0)
  const before = await cfi(page)

  await page.frameLocator('iframe').getByRole('link', { name: 'a note' }).click()
  await expect(heading(page, 'Notes')).toBeVisible()
  // The notes chapter has no contents entry, so none is marked current.
  await expect(contents(page).locator('[aria-current="true"]')).toHaveCount(0)

  await back(page).click()
  await expect(heading(page, 'Chapter One')).toBeVisible()
  await expect.poll(() => cfi(page)).toBe(before)
  await expect(contents(page).getByRole('button', { name: 'Chapter One' })).toHaveAttribute(
    'aria-current',
    'true',
  )
  await expect(back(page)).toHaveCount(0)
})

test('a non-linear chapter with its own contents entry is marked current', async ({ page }) => {
  await contents(page).getByRole('button', { name: 'Appendix' }).click()
  await expect(heading(page, 'Appendix')).toBeVisible()
  await expect(contents(page).getByRole('button', { name: 'Appendix' })).toHaveAttribute(
    'aria-current',
    'true',
  )
})

test('Back after a contents jump returns to the page paged to, one move at a time', async ({
  page,
}) => {
  // Paging is ignored while the opening layout settles, and for 100 ms after
  // each page turn (the paginator's lock).
  await page.waitForTimeout(300)
  const start = await cfi(page)
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect.poll(() => cfi(page)).not.toBe(start)
  const paged = await cfi(page)
  await page.waitForTimeout(300)
  // Paging adds no step.
  await expect(back(page)).toHaveCount(0)

  await contents(page).getByRole('button', { name: 'Chapter Two' }).click()
  await expect(heading(page, 'Chapter Two')).toBeVisible()
  await contents(page).getByRole('button', { name: 'Appendix' }).click()
  await expect(heading(page, 'Appendix')).toBeVisible()

  await back(page).click()
  await expect(heading(page, 'Chapter Two')).toBeVisible()
  await back(page).click()
  await expect.poll(() => cfi(page)).toBe(paged)
  await expect(back(page)).toHaveCount(0)
})
