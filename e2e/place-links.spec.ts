import { expect, test, type Page } from '@playwright/test'

// docs/SPEC.md, "Links to a place in a book".
const FIXTURES = 'http://127.0.0.1:4174'
const BOOK = `${FIXTURES}/basic-ltr.epub`
const link = (fragment: string) => `/?book=${encodeURIComponent(BOOK)}${fragment}`

type ViewElement = Element & { lastLocation?: { cfi: string } }

/** Whether the element with `id` is on the visible page, not merely in the
 *  chapter: its centre inside the book's own box (a pinned contents column
 *  narrows it; the next page can start within a pixel of its edge). */
async function onScreen(page: Page, id: string): Promise<boolean> {
  const box = await page.frameLocator('iframe').locator(`#${id}`).boundingBox()
  const book = await page.locator('foliate-view').boundingBox()
  if (!box || !book) return false
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  return x > book.x && x < book.x + book.width && y > book.y && y < book.y + book.height
}

const heading = (page: Page, name: string) =>
  page.frameLocator('iframe').getByRole('heading', { name })

const note = (page: Page) =>
  page.getByRole('status').filter({ hasText: 'The place this link points to was not found' })

test('a chapter link opens at that chapter and leaves the address without its fragment', async ({
  page,
}) => {
  await page.goto(link('#chapter2'))
  await expect(heading(page, 'Chapter Two')).toBeVisible()
  await expect.poll(() => onScreen(page, 'p1')).toBe(true)
  // The check tells pages apart: the chapter's last paragraph is further on.
  expect(await onScreen(page, 'p16')).toBe(false)
  const address = new URL(page.url())
  expect(address.hash).toBe('')
  expect(address.searchParams.get('book')).toBe(BOOK)
  await expect(note(page)).toHaveCount(0)
})

test('an element link opens at that element', async ({ page }) => {
  await page.goto(link('#chapter3/p14'))
  await expect(heading(page, 'Chapter Three')).toBeAttached()
  await expect.poll(() => onScreen(page, 'p14')).toBe(true)
})

test('the link wins over the saved position of a stored book, which opens without a download', async ({
  page,
}) => {
  await page.goto(link(''))
  await expect(heading(page, 'Chapter One')).toBeVisible()
  await page.goto('/')

  const fetched: string[] = []
  page.on('request', (request) => {
    if (request.url() === BOOK) fetched.push(request.url())
  })
  await page.goto(link('#chapter2/p12'))
  await expect.poll(() => onScreen(page, 'p12')).toBe(true)
  expect(fetched).toEqual([])
})

test('a CFI link opens at that CFI', async ({ page }) => {
  await page.goto(link('#chapter3/p14'))
  await expect.poll(() => onScreen(page, 'p14')).toBe(true)
  const cfi = await page.evaluate(
    () => (document.querySelector('foliate-view') as ViewElement | null)?.lastLocation?.cfi,
  )
  expect(cfi).toMatch(/^epubcfi\(/)
  await page.goto('/')
  await page.goto(link(`#${encodeURIComponent(cfi!)}`))
  await expect.poll(() => onScreen(page, 'p14')).toBe(true)
})

test('a place the book does not have opens the book as usual and says so', async ({ page }) => {
  await page.goto(link('#chapter9'))
  await expect(heading(page, 'Chapter One')).toBeVisible()
  await expect(note(page)).toBeVisible()
  await note(page).getByRole('button', { name: 'Close' }).click()
  await expect(note(page)).toHaveCount(0)

  await page.goto('/')
  await page.goto(link('#chapter2/no-such-id'))
  await expect(note(page)).toBeVisible()
})

test('a new fragment while the book is open moves there without reopening', async ({ page }) => {
  await page.goto(link('#chapter2'))
  await expect(heading(page, 'Chapter Two')).toBeVisible()
  const view = await page.locator('foliate-view').elementHandle()
  await page.evaluate(() => (location.hash = '#chapter3/p5'))
  await expect.poll(() => onScreen(page, 'p5')).toBe(true)
  expect(new URL(page.url()).hash).toBe('')
  // The same view: the book was not reopened.
  expect(await view?.evaluate((element) => element.isConnected)).toBe(true)
})
