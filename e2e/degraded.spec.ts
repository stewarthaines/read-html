import { expect, test } from '@playwright/test'
import { BASIC_LTR } from './helpers'

// Feature 11: with no storage available at all, the reader still reads —
// the library just does not survive the session, and the app says so.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      get() {
        throw new DOMException('storage disabled', 'SecurityError')
      },
    })
    Object.defineProperty(navigator, 'storage', { value: undefined })
  })
})

test('memory-only storage: notice shown, importing and reading still work', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('status')).toContainText('last only until this page closes')

  await page.setInputFiles('input[type=file]', BASIC_LTR)
  const section = page.frameLocator('iframe')
  await expect(section.getByRole('heading', { name: 'Chapter One' })).toBeVisible()

  // The session library works from memory.
  await page.getByRole('button', { name: 'Library' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Basic LTR' })).toBeVisible()

  // Nothing survives a reload — that is the documented degradation.
  await page.reload()
  await expect(page.getByRole('status')).toContainText('last only until this page closes')
  await expect(page.getByRole('listitem')).toHaveCount(0)
})
