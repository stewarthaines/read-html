import { expect, test, type Locator, type Page } from '@playwright/test'

// docs/SPEC.md, "A picture fullscreen, with zoom and pan".
const BOOK = 'http://127.0.0.1:4174/pictures-book.epub'

const inBook = (page: Page, selector: string) => page.frameLocator('iframe').locator(selector)
const viewer = (page: Page) => page.getByRole('dialog', { name: 'A map of the district' })
const picture = (page: Page) => viewer(page).locator('img')

async function box(locator: Locator) {
  const found = await locator.boundingBox()
  if (!found) throw new Error('no box')
  return found
}

/** Synthetic pointer events, which both engines deliver alike, for a pinch. */
async function pointer(page: Page, type: string, id: number, x: number, y: number) {
  await page.locator('.picture-stage').dispatchEvent(type, {
    pointerId: id,
    pointerType: 'touch',
    isPrimary: id === 1,
    clientX: x,
    clientY: y,
    bubbles: true,
  })
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 })
  await page.goto(`/?book=${encodeURIComponent(BOOK)}`)
  await expect(page.frameLocator('iframe').getByRole('heading', { name: 'Pictures' })).toBeVisible()
})

test('a tapped picture opens fitted to the screen, and only Close or Escape closes it', async ({
  page,
}) => {
  await inBook(page, '#map').click()
  await expect(viewer(page)).toBeVisible()
  const fitted = await box(picture(page))
  // Fitted: as large as the screen allows (a 4:3 picture on a 1200×800 screen).
  expect(fitted.height).toBeGreaterThan(600)
  expect(fitted.x).toBeGreaterThanOrEqual(0)
  expect(fitted.x + fitted.width).toBeLessThanOrEqual(1200)

  // A tap beside the picture does nothing.
  await page.mouse.click(5, 790)
  await expect(viewer(page)).toBeVisible()

  await viewer(page).getByRole('button', { name: 'Close' }).click()
  await expect(viewer(page)).toBeHidden()
  await expect(page.frameLocator('iframe').getByRole('heading', { name: 'Pictures' })).toBeVisible()

  await inBook(page, '#map').click()
  await expect(viewer(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(viewer(page)).toBeHidden()
})

test('an ornament does not open, and a picture inside a link follows the link', async ({
  page,
}) => {
  await inBook(page, '#ornament').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await inBook(page, '#portrait').click()
  await expect(
    page.frameLocator('iframe').getByRole('heading', { name: 'Chapter Two' }),
  ).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('a picture drawn in SVG opens too', async ({ page }) => {
  await inBook(page, '#drawn').click()
  await expect(page.getByRole('dialog', { name: 'Picture' })).toBeVisible()
})

test('zoom with the buttons, keys, wheel and double-click, within its limits', async ({ page }) => {
  await inBook(page, '#map').click()
  const fitted = await box(picture(page))

  await viewer(page).getByRole('button', { name: 'Zoom in' }).click()
  const zoomed = await box(picture(page))
  expect(zoomed.width).toBeGreaterThan(fitted.width * 1.2)
  await viewer(page).getByRole('button', { name: 'Zoom out' }).click()
  await expect
    .poll(async () => Math.round((await box(picture(page))).width))
    .toBe(Math.round(fitted.width))

  // Never smaller than fitted.
  await page.keyboard.press('-')
  expect(Math.round((await box(picture(page))).width)).toBe(Math.round(fitted.width))
  await page.keyboard.press('+')
  expect((await box(picture(page))).width).toBeGreaterThan(fitted.width * 1.2)
  for (let i = 0; i < 20; i++) await page.keyboard.press('+')
  // At most four times fitted (the 1600-pixel picture's twice-size is smaller).
  expect((await box(picture(page))).width).toBeLessThanOrEqual(fitted.width * 4 + 1)

  await page.dblclick('.picture-stage')
  expect(Math.round((await box(picture(page))).width)).toBe(Math.round(fitted.width))
  await page.dblclick('.picture-stage')
  expect((await box(picture(page))).width).toBeGreaterThan(fitted.width * 1.2)
  await page.dblclick('.picture-stage')

  await page.mouse.move(600, 400)
  await page.mouse.wheel(0, -300)
  await expect
    .poll(async () => (await box(picture(page))).width)
    .toBeGreaterThan(fitted.width * 1.2)
})

test('zoomed, the picture pans by dragging and with the arrow keys, and stays on screen', async ({
  page,
}) => {
  await inBook(page, '#map').click()
  await viewer(page).getByRole('button', { name: 'Zoom in' }).click()
  await viewer(page).getByRole('button', { name: 'Zoom in' }).click()
  const start = await box(picture(page))

  await page.mouse.move(600, 400)
  await page.mouse.down()
  await page.mouse.move(700, 450, { steps: 5 })
  await page.mouse.up()
  const dragged = await box(picture(page))
  expect(Math.round(dragged.x - start.x)).toBe(100)
  expect(Math.round(dragged.y - start.y)).toBe(50)

  await page.keyboard.press('ArrowLeft')
  expect((await box(picture(page))).x).toBeGreaterThan(dragged.x)

  // Dragged far, it stops with its edge at the screen's edge.
  for (let i = 0; i < 2; i++) {
    await page.mouse.move(100, 400)
    await page.mouse.down()
    await page.mouse.move(1150, 400, { steps: 5 })
    await page.mouse.up()
  }
  expect(Math.round((await box(picture(page))).x)).toBe(0)
})

test('a pinch zooms', async ({ page }) => {
  await inBook(page, '#map').click()
  const fitted = await box(picture(page))
  await pointer(page, 'pointerdown', 1, 550, 400)
  await pointer(page, 'pointerdown', 2, 650, 400)
  await pointer(page, 'pointermove', 1, 450, 400)
  await pointer(page, 'pointermove', 2, 750, 400)
  await pointer(page, 'pointerup', 1, 450, 400)
  await pointer(page, 'pointerup', 2, 750, 400)
  const pinched = await box(picture(page))
  expect(pinched.width).toBeGreaterThan(fitted.width * 2.5)
})

test('in a scripted book with scripts on, a photo opens and a clip with a picture plays instead', async ({
  page,
}) => {
  await page.goto('/')
  await page.setInputFiles('input[type=file]', 'fixtures/build/scripted-clips.epub')
  await page
    .getByRole('dialog', { name: 'Interactive features' })
    .getByRole('button', { name: 'Enable them' })
    .click()
  const section = page.frameLocator('iframe')
  await expect(section.getByRole('heading', { name: 'Clips Chapter' })).toBeVisible()

  await section.locator('#clip-picture').click()
  await expect
    .poll(() => section.locator('audio').evaluate((el) => (el as HTMLAudioElement).paused))
    .toBe(false)
  await expect(page.getByRole('dialog', { name: 'Picture' })).toHaveCount(0)

  await section.locator('#photo').click()
  await expect(page.getByRole('dialog', { name: 'A photo' })).toBeVisible()
})
