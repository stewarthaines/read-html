import { expect, test, type Page } from '@playwright/test'
import { openFixture, readingFraction } from './helpers'

const FIXED_LAYOUT = 'fixtures/build/fixed-layout.epub'

// The bands are hidden from assistive technology, so found by class.
const edges = (page: Page) => page.locator('.edge')

async function edgeBox(page: Page, side: 'left' | 'right') {
  const boxes = await Promise.all((await edges(page).all()).map((edge) => edge.boundingBox()))
  const sorted = boxes.filter((box) => box !== null).sort((a, b) => a.x - b.x)
  return side === 'left' ? sorted[0] : sorted[sorted.length - 1]
}

test('the blank band either side of a paginated book turns the page', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const section = await openFixture(page)
  await expect(edges(page)).toHaveCount(2)

  // A band covers only blank space: it ends before the text column starts.
  const left = await edgeBox(page, 'left')
  const heading = await section.getByRole('heading', { name: 'Chapter One' }).boundingBox()
  if (!left || !heading) throw new Error('no band or heading')
  expect(left.x + left.width).toBeLessThanOrEqual(heading.x + 1)

  const start = (await readingFraction(page)) ?? 0
  const right = await edgeBox(page, 'right')
  if (!right) throw new Error('no right band')
  await page.mouse.click(right.x + right.width / 2, right.y + right.height / 2)
  await expect.poll(() => readingFraction(page)).toBeGreaterThan(start)
  // Foliate ignores a turn asked for while the last one is still settling.
  await page.waitForTimeout(300)
  await page.mouse.click(left.x + left.width / 2, left.y + left.height / 2)
  await expect.poll(() => readingFraction(page)).toBe(start)

  // Clicking a band leaves focus where it was.
  expect(await page.evaluate(() => document.activeElement?.classList.contains('edge'))).toBe(false)
})

test('a fixed-layout book pages from its letterbox, and has no bands when the page fills the width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 800 })
  await page.goto('/')
  await page.setInputFiles('input[type=file]', FIXED_LAYOUT)
  const section = page.frameLocator('iframe[title="Book content"]')
  await expect(section.getByRole('heading', { name: 'Page One' })).toBeVisible()
  await expect(edges(page)).toHaveCount(2)
  const right = await edgeBox(page, 'right')
  if (!right) throw new Error('no right band')
  await page.mouse.click(right.x + right.width / 2, right.y + right.height / 2)
  await expect(section.getByRole('heading', { name: 'Page Two' })).toBeVisible()

  // A 400×600 page in a tall narrow window fills its width: no room for bands.
  await page.setViewportSize({ width: 400, height: 1000 })
  await expect(edges(page)).toHaveCount(0)
})

test('no bands in scrolled flow', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('readhtml_settings', JSON.stringify({ flow: 'scrolled' }))
  })
  await page.setViewportSize({ width: 1280, height: 800 })
  await openFixture(page)
  await page.waitForTimeout(300)
  await expect(edges(page)).toHaveCount(0)
})
