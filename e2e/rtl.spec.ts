import { expect, test, type Page } from '@playwright/test'
import { readingFraction } from './helpers'

const RTL_BOOK = 'fixtures/build/rtl-book.epub'

async function openRtlFixture(page: Page) {
  await page.goto('/')
  await page.setInputFiles('input[type=file]', RTL_BOOK)
  const section = page.frameLocator('iframe')
  await expect(section.getByRole('heading', { name: 'الفصل الأول' })).toBeVisible()
  return section
}

test('the RTL book opens and reports rtl progression', async ({ page }) => {
  await openRtlFixture(page)
  const dir = await page.evaluate(
    () =>
      (document.querySelector('foliate-view') as Element & { book?: { dir?: string } }).book?.dir,
  )
  expect(dir).toBe('rtl')
})

test('logical toolbar buttons: Next advances an RTL book', async ({ page }) => {
  await openRtlFixture(page)
  const start = (await readingFraction(page)) ?? 0
  const click = (name: string) => async () => {
    await page.getByRole('button', { name }).click()
    return readingFraction(page)
  }
  await expect.poll(click('Next page')).toBeGreaterThan(start)
  await expect.poll(click('Previous page')).toBe(start)
})

test('physical arrows map to logical paging: ArrowLeft is next in RTL', async ({ page }) => {
  await openRtlFixture(page)
  const start = (await readingFraction(page)) ?? 0
  const press = (key: string) => async () => {
    await page.keyboard.press(key)
    return readingFraction(page)
  }
  await expect.poll(press('ArrowLeft')).toBeGreaterThan(start)
  await expect.poll(press('ArrowRight')).toBe(start)
  await expect.poll(press('PageDown')).toBeGreaterThan(start)
  await expect.poll(press('PageUp')).toBe(start)
})

test('TOC navigates within the RTL book', async ({ page }) => {
  const section = await openRtlFixture(page)
  await page.getByRole('button', { name: 'Contents' }).click()
  const drawer = page.getByRole('dialog', { name: 'Contents' })
  await drawer.getByRole('button', { name: 'الفصل الثالث' }).click()
  await expect(section.getByRole('heading', { name: 'الفصل الثالث' })).toBeVisible()
  await expect(drawer).not.toBeVisible()
})
