import { expect, test } from '@playwright/test'

const LONG_TOC = 'fixtures/build/long-toc.epub'
const LONG_TITLE = 'The Return of Meskhetian Archival Materials to Performing Practice'
const SLUG = 'batonebis_mamidasa_score_supplementary_materials_appendix'

test('long TOC titles wrap inside a bounded drawer', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('input[type=file]', LONG_TOC)
  await expect(
    page.frameLocator('iframe[title="Book content"]').getByRole('heading', { level: 1 }).first(),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Contents' }).click()
  const drawer = page.getByRole('dialog', { name: 'Contents' })
  await expect(drawer).toBeVisible()

  // The drawer is bounded, not stretched to the longest entry.
  const drawerBox = await drawer.boundingBox()
  const viewport = page.viewportSize()
  expect(drawerBox).not.toBeNull()
  expect(drawerBox!.width).toBeLessThanOrEqual((viewport?.width ?? 1280) * 0.86)

  // A long title occupies more than one line (wraps): its box is taller than
  // two font-sizes, which a single line never is.
  const entry = drawer.getByRole('button', { name: LONG_TITLE })
  const entryBox = await entry.boundingBox()
  const fontSize = await entry.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  expect(entryBox!.height).toBeGreaterThan(fontSize * 2)

  // The unbreakable slug does not overflow the drawer horizontally.
  const slug = drawer.getByRole('button', { name: SLUG })
  const slugBox = await slug.boundingBox()
  expect(slugBox!.width).toBeLessThanOrEqual(drawerBox!.width)
})

test('the TOC drawer closes via its close button and via a backdrop click', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('input[type=file]', LONG_TOC)
  await expect(
    page.frameLocator('iframe[title="Book content"]').getByRole('heading', { level: 1 }).first(),
  ).toBeVisible()
  const drawer = page.getByRole('dialog', { name: 'Contents' })

  // Explicit close button.
  await page.getByRole('button', { name: 'Contents' }).click()
  await expect(drawer).toBeVisible()
  await drawer.getByRole('button', { name: 'Close' }).click()
  await expect(drawer).not.toBeVisible()

  // Backdrop click (well to the right of the left-pinned drawer).
  await page.getByRole('button', { name: 'Contents' }).click()
  await expect(drawer).toBeVisible()
  await page.mouse.click(1100, 400)
  await expect(drawer).not.toBeVisible()
})

test('a TOC taller than the viewport scrolls to its last entry', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 320 })
  await page.goto('/')
  await page.setInputFiles('input[type=file]', LONG_TOC)
  await expect(
    page.frameLocator('iframe[title="Book content"]').getByRole('heading', { level: 1 }).first(),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Contents' }).click()
  const drawer = page.getByRole('dialog', { name: 'Contents' })
  // The drawer fits within the viewport (does not overflow it) and scrolls.
  const drawerBox = await drawer.boundingBox()
  expect(drawerBox!.height).toBeLessThanOrEqual(320)
  expect(await drawer.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(0)

  // The last entry is reachable and fully visible at the bottom of the scroll.
  await drawer.evaluate((el) => (el.scrollTop = el.scrollHeight))
  const last = drawer.getByRole('button', { name: 'Imprint' })
  const lastBox = await last.boundingBox()
  expect(lastBox!.y).toBeGreaterThanOrEqual(drawerBox!.y - 0.5)
  expect(lastBox!.y + lastBox!.height).toBeLessThanOrEqual(drawerBox!.y + drawerBox!.height + 0.5)
})
