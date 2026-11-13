import { expect, test } from '@playwright/test'
import { openFixture } from './helpers'

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

test('the drawer heads with the book and marks the chapter being read', async ({ page }) => {
  await page.goto('/')
  await page.setInputFiles('input[type=file]', 'fixtures/build/basic-ltr.epub')
  await expect(
    page.frameLocator('iframe[title="Book content"]').getByRole('heading', { level: 1 }).first(),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Contents' }).click()
  const drawer = page.getByRole('dialog', { name: 'Contents' })
  await expect(drawer).toBeVisible()

  // The book's cover, title and author head the drawer.
  await expect(drawer.locator('.toc-head img')).toBeVisible()
  await expect(drawer.getByText('Basic LTR', { exact: true })).toBeVisible()
  await expect(drawer.getByText('Fixture Author', { exact: true })).toBeVisible()

  // The opening chapter is the current one, and only it.
  await expect(drawer.getByRole('button', { name: 'Chapter One' })).toHaveAttribute(
    'aria-current',
    'true',
  )
  await expect(drawer.locator('[aria-current="true"]')).toHaveCount(1)

  // Navigate to chapter three: the open drawer moves its mark there.
  await drawer.getByRole('button', { name: 'Chapter Three' }).click()
  await expect(
    page
      .frameLocator('iframe[title="Book content"]')
      .getByRole('heading', { name: 'Chapter Three' }),
  ).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Chapter Three' })).toHaveAttribute(
    'aria-current',
    'true',
  )
  await expect(drawer.getByRole('button', { name: 'Chapter One' })).not.toHaveAttribute(
    'aria-current',
    /.*/,
  )
})

test('the contents pin beside the book, stay pinned across reloads, and unpin', async ({
  page,
}) => {
  const section = await openFixture(page)
  await page.getByRole('button', { name: 'Contents' }).click()
  await page.getByRole('button', { name: 'Pin beside the book' }).click()

  // The drawer gives way to a column beside the book; the toolbar's Contents
  // button goes while the column is there.
  const pane = page.getByRole('complementary', { name: 'Contents' })
  await expect(pane).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Contents' })).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Contents' })).toHaveCount(0)

  // Entries navigate and the mark follows, with the book still readable.
  await pane.getByRole('button', { name: 'Chapter Three' }).click()
  await expect(section.getByRole('heading', { name: 'Chapter Three' })).toBeVisible()
  await expect(pane.getByRole('button', { name: 'Chapter Three' })).toHaveAttribute(
    'aria-current',
    'true',
  )

  // A reading mode: still pinned after a reload.
  await page.reload()
  await page.getByRole('button', { name: /^Basic LTR/ }).click()
  await expect(pane).toBeVisible()

  // Closing the column restores the full-width reader and the Contents button.
  await pane.getByRole('button', { name: 'Close' }).click()
  await expect(pane).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Contents' })).toBeVisible()
})

test('a narrow window offers no pin and shows a pinned setting as the drawer', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 })
  await openFixture(page)
  await page.getByRole('button', { name: 'Contents' }).click()
  await expect(page.getByRole('dialog', { name: 'Contents' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pin beside the book' })).toHaveCount(0)
})
