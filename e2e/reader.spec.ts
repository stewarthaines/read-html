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

test('the TOC drawer navigates between chapters and stays open until closed', async ({ page }) => {
  const section = await openFixture(page)
  await page.getByRole('button', { name: 'Contents' }).click()
  const drawer = page.getByRole('dialog')
  await expect(drawer).toBeVisible()
  await drawer.getByRole('button', { name: 'Chapter Three' }).click()
  await expect(section.getByRole('heading', { name: 'Chapter Three' })).toBeVisible()
  await expect(drawer).toBeVisible()
  await drawer.getByRole('button', { name: 'Chapter Two' }).click()
  await expect(section.getByRole('heading', { name: 'Chapter Two' })).toBeVisible()
  await drawer.getByRole('button', { name: 'Close' }).click()
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

// Paging on past either end of the book used to throw inside foliate's page
// turn and leave its navigation lock held, so every later page turn and
// contents choice did nothing (vendored foliate patch 10).
for (const flow of ['Pages', 'Scroll'] as const) {
  test(`paging past the end of the book in ${flow} mode leaves navigation working`, async ({
    page,
  }) => {
    const section = await openFixture(page)
    if (flow === 'Scroll') {
      await page.getByRole('button', { name: 'Settings' }).click()
      const settings = page.getByRole('dialog', { name: 'Settings' })
      await settings.getByRole('radio', { name: 'Scroll' }).check()
      await settings.getByRole('button', { name: 'Close' }).click()
    }
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))

    await page.getByRole('button', { name: 'Contents' }).click()
    const drawer = page.getByRole('dialog', { name: 'Contents' })
    await drawer.getByRole('button', { name: 'Chapter Three' }).click()
    await expect(section.getByRole('heading', { name: 'Chapter Three' })).toBeVisible()
    await drawer.getByRole('button', { name: 'Close' }).click()

    // Well past the last page, then back at the start and past the first.
    const next = page.getByRole('button', { name: 'Next page' })
    for (let turn = 0; turn < 12; turn++) {
      await next.click()
      await page.waitForTimeout(150)
    }

    await page.getByRole('button', { name: 'Contents' }).click()
    await drawer.getByRole('button', { name: 'Chapter One' }).click()
    await expect(section.getByRole('heading', { name: 'Chapter One' })).toBeVisible()
    await drawer.getByRole('button', { name: 'Close' }).click()
    const prev = page.getByRole('button', { name: 'Previous page' })
    for (let turn = 0; turn < 4; turn++) {
      await prev.click()
      await page.waitForTimeout(150)
    }
    await page.getByRole('button', { name: 'Contents' }).click()
    await drawer.getByRole('button', { name: 'Chapter Two' }).click()
    await expect(section.getByRole('heading', { name: 'Chapter Two' })).toBeVisible()
    expect(errors).toEqual([])
  })
}
