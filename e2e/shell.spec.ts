import { expect, test } from '@playwright/test'

test('the empty app shell renders', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('READ.html')
  await expect(page.locator('main')).toBeVisible()
})
