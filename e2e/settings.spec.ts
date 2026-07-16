import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { openFixture } from './helpers'

type ViewWithRenderer = Element & { renderer?: Element }

const flowAttribute = (page: Page) =>
  page.evaluate(() =>
    (document.querySelector('foliate-view') as ViewWithRenderer | null)?.renderer?.getAttribute(
      'flow',
    ),
  )

const bookBodyFontSize = async (page: Page) =>
  parseFloat(
    await page
      .frameLocator('iframe')
      .locator('body')
      .evaluate((el) => getComputedStyle(el).fontSize),
  )

const appBackgroundIsDark = (page: Page) =>
  page.evaluate(() => {
    const [r, g, b] = getComputedStyle(document.body)
      .backgroundColor.replace(/[^\d.,]/g, '')
      .split(',')
      .map(Number)
    return (r + g + b) / 3 < 128
  })

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click()
  return page.getByRole('dialog', { name: 'Settings' })
}

async function reopenFromLibrary(page: Page) {
  await page.getByRole('button', { name: /^Basic LTR/ }).click()
  await expect(
    page.frameLocator('iframe').getByRole('heading', { name: 'Chapter One' }),
  ).toBeVisible()
}

test('font size scales book content and persists across reload', async ({ page }) => {
  await openFixture(page)
  const before = await bookBodyFontSize(page)
  const dialog = await openSettings(page)
  await dialog.getByRole('slider', { name: /Font size/ }).fill('150')
  await expect.poll(() => bookBodyFontSize(page)).toBeGreaterThan(before)
  await dialog.getByRole('button', { name: 'Close' }).click()

  await page.reload()
  await reopenFromLibrary(page)
  await expect.poll(() => bookBodyFontSize(page)).toBeGreaterThan(before)
})

test('scroll mode switches the flow attribute and persists', async ({ page }) => {
  await openFixture(page)
  expect(await flowAttribute(page)).toBe('paginated')
  const dialog = await openSettings(page)
  await dialog.getByRole('combobox', { name: 'Reading mode' }).selectOption('scrolled')
  await expect.poll(() => flowAttribute(page)).toBe('scrolled')
  await dialog.getByRole('button', { name: 'Close' }).click()

  await page.reload()
  await reopenFromLibrary(page)
  await expect.poll(() => flowAttribute(page)).toBe('scrolled')
})

test('theme follows prefers-color-scheme by default; manual override persists', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  expect(await appBackgroundIsDark(page)).toBe(true)

  await page.emulateMedia({ colorScheme: 'light' })
  await expect.poll(() => appBackgroundIsDark(page)).toBe(false)

  const dialog = await openSettings(page)
  await dialog.getByRole('combobox', { name: 'Theme' }).selectOption('dark')
  await expect.poll(() => appBackgroundIsDark(page)).toBe(true)
  await dialog.getByRole('button', { name: 'Close' }).click()

  await page.reload()
  await expect.poll(() => appBackgroundIsDark(page)).toBe(true)
})

test('dark theme reaches book content without inverting', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  const section = await openFixture(page)
  const dialog = await openSettings(page)
  await dialog.getByRole('combobox', { name: 'Theme' }).selectOption('dark')
  await dialog.getByRole('button', { name: 'Close' }).click()
  // Section root text color flips to the dark scheme's CanvasText (light).
  await expect
    .poll(async () => {
      const color = await section.locator('html').evaluate((el) => getComputedStyle(el).color)
      const [r, g, b] = color
        .replace(/[^\d.,]/g, '')
        .split(',')
        .map(Number)
      return (r + g + b) / 3 > 128
    })
    .toBe(true)
  const filter = await section.locator('html').evaluate((el) => getComputedStyle(el).filter)
  expect(filter === 'none' || filter === '').toBe(true)
})

test('paging keys are inert while the settings dialog is open', async ({ page }) => {
  await openFixture(page)
  const fraction = () =>
    page.evaluate(
      () =>
        (
          document.querySelector('foliate-view') as Element & {
            lastLocation?: { fraction: number }
          }
        ).lastLocation?.fraction,
    )
  const start = await fraction()
  const dialog = await openSettings(page)
  // Aim keys at the Close button — arrows on a focused <select> legitimately
  // change its value, which is native behavior, not paging.
  await dialog.getByRole('button', { name: 'Close' }).focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('PageDown')
  await page.waitForTimeout(300)
  expect(await fraction()).toBe(start)
})

test('settings dialog has no accessibility violations', async ({ page }) => {
  await openFixture(page)
  await openSettings(page)
  const scan = await new AxeBuilder({ page }).analyze()
  expect(scan.violations).toEqual([])
})
