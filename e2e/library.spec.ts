import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { importFixture, openFixture, readingFraction } from './helpers'

test('an imported book appears in the library with cover, title, author, progress', async ({
  page,
}) => {
  await openFixture(page)
  await page.getByRole('button', { name: 'Library' }).click()
  const item = page.getByRole('listitem').filter({ hasText: 'Basic LTR' })
  await expect(item).toBeVisible()
  await expect(item).toContainText('Fixture Author')
  await expect(item).toContainText('%')
  await expect(item.locator('img.cover')).toBeVisible()
})

test('reading position persists across close, reopen, and reload', async ({ page }) => {
  await openFixture(page)
  const start = (await readingFraction(page)) ?? 0
  const next = async () => {
    await page.getByRole('button', { name: 'Next page' }).click()
    return readingFraction(page)
  }
  await expect.poll(next).toBeGreaterThan(start)
  const advanced = (await readingFraction(page)) ?? 0

  await page.getByRole('button', { name: 'Library' }).click()
  await page.reload()
  const item = page.getByRole('button', { name: /^Basic LTR/ })
  await expect(item).toBeVisible()
  await item.click()
  await expect(page.frameLocator('iframe').getByText('Paragraph 1 of Chapter One')).toBeAttached()
  await expect.poll(() => readingFraction(page)).toBeCloseTo(advanced, 5)
})

test('re-importing the same file does not create a duplicate', async ({ page }) => {
  await openFixture(page)
  await page.getByRole('button', { name: 'Library' }).click()
  await importFixture(page)
  await expect(
    page.frameLocator('iframe').getByRole('heading', { name: 'Chapter One' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Library' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Basic LTR' })).toHaveCount(1)
})

test('deleting a book removes it from the library, surviving reload', async ({ page }) => {
  await openFixture(page)
  await page.getByRole('button', { name: 'Library' }).click()
  page.on('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Delete Basic LTR' }).click()
  await expect(page.getByRole('listitem')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Open a book' })).toBeVisible()
  await expect(page.getByRole('listitem')).toHaveCount(0)
})

test('library with a book has no accessibility violations', async ({ page }) => {
  await openFixture(page)
  await page.getByRole('button', { name: 'Library' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Basic LTR' })).toBeVisible()
  const scan = await new AxeBuilder({ page }).analyze()
  expect(scan.violations).toEqual([])
})
