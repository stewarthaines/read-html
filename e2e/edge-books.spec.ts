import { expect, test } from '@playwright/test'

// §6 edge fixtures: FXL renders without crashing (the only v1 claim), and
// missing metadata falls back sensibly in the library.

test('fixed-layout book renders without crashing', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('input[type=file]', 'fixtures/build/fixed-layout.epub')
  // The FXL renderer keeps an iframe per spread page; target the loaded one.
  const section = page.frameLocator('iframe[title="Book content"]')
  await expect(section.getByRole('heading', { name: 'Page One' })).toBeVisible()
  await expect(page.getByRole('alert')).not.toBeVisible()
  const renderer = await page.evaluate(
    () =>
      (document.querySelector('foliate-view') as Element & { renderer?: Element }).renderer
        ?.tagName,
  )
  expect(renderer).toBe('FOLIATE-FXL')
})

test('missing metadata falls back to the file name in the library', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('input[type=file]', 'fixtures/build/no-metadata.epub')
  const section = page.frameLocator('iframe')
  await expect(section.getByRole('heading', { name: 'The Only Chapter' })).toBeVisible()

  await page.getByRole('button', { name: 'Library' }).click()
  const item = page.getByRole('listitem').filter({ hasText: 'no-metadata.epub' })
  await expect(item).toBeVisible()
  // No cover: the placeholder renders instead of an image.
  await expect(item.locator('span.cover')).toBeVisible()
  await expect(item.locator('img.cover')).toHaveCount(0)
})
