import { expect, test } from '@playwright/test'
import { openFixture } from './helpers'

// docs/SPEC.md, "Contents pinned by default on a wide screen". No seeded
// settings here: these tests are the first visit.

test('a first-time reader on a wide window sees the contents pinned beside the book', async ({
  page,
}) => {
  await openFixture(page)
  const pane = page.getByRole('complementary', { name: 'Contents' })
  await expect(pane).toBeVisible()
  await expect(pane.getByRole('button', { name: 'Chapter One' })).toHaveAttribute(
    'aria-current',
    'true',
  )
  await expect(page.getByRole('button', { name: 'Contents' })).toHaveCount(0)
})

test('closing the pinned contents is kept as a choice across reloads', async ({ page }) => {
  await openFixture(page)
  const pane = page.getByRole('complementary', { name: 'Contents' })
  await pane.getByRole('button', { name: 'Close' }).click()
  await expect(pane).toHaveCount(0)

  await page.reload()
  await page.getByRole('button', { name: /^Basic LTR/ }).click()
  await expect(page.getByRole('button', { name: 'Contents' })).toBeVisible()
  await expect(pane).toHaveCount(0)
})

test('a narrow window shows the drawer, not a pinned column', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 })
  await openFixture(page)
  await expect(page.getByRole('complementary', { name: 'Contents' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Contents' })).toBeVisible()
})

test('an old unpinned setting reads as not chosen, so the contents pin', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem('readhtml_settings', JSON.stringify({ tocPinned: false, fontSize: 120 }))
    }
  })
  await openFixture(page)
  await expect(page.getByRole('complementary', { name: 'Contents' })).toBeVisible()
})
