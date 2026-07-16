import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { openFixture, readingFraction } from './helpers'

test('opening an EPUB from the file picker renders the first page paginated', async ({ page }) => {
  const section = await openFixture(page)
  await expect(section.getByText('Paragraph 1 of Chapter One', { exact: false })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Basic LTR' })).toBeVisible()
})

// The paginator ignores navigation while its page-turn animation runs
// (paginator.js #locked), so paging inputs are repeated inside the poll until
// the position settles. Backward paging floors at the start of the book, so
// repetition cannot overshoot these assertions.
test('next and previous toolbar buttons move the reading position', async ({ page }) => {
  await openFixture(page)
  const start = (await readingFraction(page)) ?? 0
  const click = (name: string) => async () => {
    await page.getByRole('button', { name }).click()
    return readingFraction(page)
  }
  await expect.poll(click('Next page')).toBeGreaterThan(start)
  await expect.poll(click('Previous page')).toBe(start)
})

test('keyboard paging: arrows, PageDown/PageUp, and Space', async ({ page }) => {
  await openFixture(page)
  const start = (await readingFraction(page)) ?? 0
  const press = (key: string) => async () => {
    await page.keyboard.press(key)
    return readingFraction(page)
  }
  await expect.poll(press('ArrowRight')).toBeGreaterThan(start)
  await expect.poll(press('ArrowLeft')).toBe(start)
  await expect.poll(press('PageDown')).toBeGreaterThan(start)
  await expect.poll(press('PageUp')).toBe(start)
  await expect.poll(press('Space')).toBeGreaterThan(start)
})

test('the TOC drawer navigates to a chapter and closes', async ({ page }) => {
  const section = await openFixture(page)
  await page.getByRole('button', { name: 'Contents' }).click()
  const drawer = page.getByRole('dialog')
  await expect(drawer).toBeVisible()
  await drawer.getByRole('button', { name: 'Chapter Three' }).click()
  await expect(section.getByRole('heading', { name: 'Chapter Three' })).toBeVisible()
  await expect(drawer).not.toBeVisible()
})

test('start screen and reader have no accessibility violations', async ({ page }) => {
  await page.goto('/')
  const startScan = await new AxeBuilder({ page }).analyze()
  expect(startScan.violations).toEqual([])

  await openFixture(page)
  const readerScan = await new AxeBuilder({ page }).analyze()
  expect(readerScan.violations).toEqual([])
})
