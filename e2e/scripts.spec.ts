import { expect, test, type Page } from '@playwright/test'

const CLIPS_BOOK = 'fixtures/build/scripted-clips.epub'
const HOSTILE_BOOK = 'fixtures/build/scripted-hostile.epub'
const PROMPT = 'This book has interactive features (audio, and similar). Enable them?'

async function importScripted(page: Page, fixture: string, heading: string) {
  await page.goto('/')
  await page.setInputFiles('input[type=file]', fixture)
  const section = page.frameLocator('iframe')
  await expect(section.getByRole('heading', { name: heading })).toBeVisible()
  return section
}

const audioState = (page: Page) =>
  page
    .frameLocator('iframe')
    .locator('audio')
    .evaluate((el) => {
      const audio = el as HTMLAudioElement
      return { paused: audio.paused, currentTime: audio.currentTime }
    })

const clipBorder = (page: Page) =>
  page
    .frameLocator('iframe')
    .locator('span.clip')
    .first()
    .evaluate((el) => getComputedStyle(el).borderBottomStyle)

test('scripted book prompts once; declining keeps scripts stripped and persists', async ({
  page,
}) => {
  await importScripted(page, CLIPS_BOOK, 'Clips Chapter')
  const dialog = page.getByRole('dialog', { name: 'Interactive features' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText(PROMPT)
  await dialog.getByRole('button', { name: 'Keep them off' }).click()
  await expect(dialog).not.toBeVisible()

  // Graceful degradation (§8 publisher contract): the clip span renders with
  // its stylesheet applied, and tapping it does nothing.
  expect(await clipBorder(page)).toBe('dotted')
  await page.frameLocator('iframe').getByText('Play the first clip').click()
  await page.waitForTimeout(400)
  expect(await audioState(page)).toEqual({ paused: true, currentTime: 0 })

  // Reopening does not re-ask: the answer was recorded.
  await page.getByRole('button', { name: 'Library' }).click()
  await page.getByRole('button', { name: /^Clips Book/ }).click()
  await expect(
    page.frameLocator('iframe').getByRole('heading', { name: 'Clips Chapter' }),
  ).toBeVisible()
  await page.waitForTimeout(200)
  await expect(page.getByRole('dialog', { name: 'Interactive features' })).not.toBeVisible()
  expect(await clipBorder(page)).toBe('dotted')
})

test('consent enables the book script: clips seek, play, and stop at data-end', async ({
  page,
}) => {
  await importScripted(page, CLIPS_BOOK, 'Clips Chapter')
  const dialog = page.getByRole('dialog', { name: 'Interactive features' })
  await dialog.getByRole('button', { name: 'Enable them' }).click()

  // The book re-renders with scripts at the same position.
  const section = page.frameLocator('iframe')
  await expect(section.getByRole('heading', { name: 'Clips Chapter' })).toBeVisible()

  // The player primes the shared element at startup from the first clip's
  // data-src — proving the rewrite landed before book scripts ran.
  await expect
    .poll(async () => section.locator('audio').evaluate((el) => (el as HTMLAudioElement).src))
    .toMatch(/^blob:/)

  const firstClip = section.getByText('Play the first clip')
  await firstClip.click()
  await expect.poll(async () => (await audioState(page)).paused, { timeout: 5000 }).toBe(false)
  await expect
    .poll(async () => firstClip.evaluate((el) => el.classList.contains('clip-playing')))
    .toBe(true)

  // The player stops the shared audio element at data-end (1s, plus slop).
  await expect.poll(async () => (await audioState(page)).paused, { timeout: 5000 }).toBe(true)
  const stopped = await audioState(page)
  expect(stopped.currentTime).toBeGreaterThanOrEqual(1)
  expect(stopped.currentTime).toBeLessThan(1.5)
  await expect
    .poll(async () => firstClip.evaluate((el) => el.classList.contains('clip-playing')))
    .toBe(false)

  // The second clip seeks the same element to its own data-begin.
  await section.getByText('Play the second clip').click()
  await expect
    .poll(async () => (await audioState(page)).currentTime, { timeout: 5000 })
    .toBeGreaterThanOrEqual(1)

  // A clip whose href resolves to nothing in the book (a real-book failure
  // mode) was warned about and left alone; it neither broke the section nor
  // the working clips.
  await expect(section.getByText('Broken clip')).toBeVisible()
  const brokenSrc = await section
    .getByText('Broken clip')
    .evaluate((el) => el.getAttribute('data-src'))
  expect(brokenSrc).toBe('missing/nowhere.mp3')
  await section.getByText('Play the first clip').click()
  await expect.poll(async () => (await audioState(page)).paused, { timeout: 5000 }).toBe(false)

  // Consent persists: reopening runs scripts without asking.
  await page.getByRole('button', { name: 'Library' }).click()
  await page.getByRole('button', { name: /^Clips Book/ }).click()
  await expect(section.getByRole('heading', { name: 'Clips Chapter' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Interactive features' })).not.toBeVisible()
  await section.getByText('Play the first clip').click()
  await expect.poll(async () => (await audioState(page)).paused, { timeout: 5000 }).toBe(false)
})

test('hostile book: the strip path really strips — no storage write without consent', async ({
  page,
}) => {
  await importScripted(page, HOSTILE_BOOK, 'Hostile Chapter')
  await expect(page.getByRole('dialog', { name: 'Interactive features' })).toBeVisible()
  // Content rendered before any answer — scripts were already stripped.
  const markers = await page.evaluate(() => [
    localStorage.getItem('readhtml_hostile_marker'),
    localStorage.getItem('readhtml_hostile_onload'),
  ])
  expect(markers).toEqual([null, null])

  await page.getByRole('button', { name: 'Keep them off' }).click()
  await page.waitForTimeout(300)
  const after = await page.evaluate(() => [
    localStorage.getItem('readhtml_hostile_marker'),
    localStorage.getItem('readhtml_hostile_onload'),
  ])
  expect(after).toEqual([null, null])
})

test('revoking in settings returns the book to stripped without re-asking', async ({ page }) => {
  await importScripted(page, CLIPS_BOOK, 'Clips Chapter')
  await page
    .getByRole('dialog', { name: 'Interactive features' })
    .getByRole('button', { name: 'Enable them' })
    .click()
  await expect(
    page.frameLocator('iframe').getByRole('heading', { name: 'Clips Chapter' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Library' }).click()
  await page.getByRole('button', { name: 'Settings' }).click()
  const settingsDialog = page.getByRole('dialog', { name: 'Settings' })
  await expect(settingsDialog.getByText('Clips Book')).toBeVisible()
  await settingsDialog.getByRole('button', { name: 'Revoke' }).click()
  await expect(settingsDialog.getByText('Clips Book')).not.toBeVisible()
  await settingsDialog.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('button', { name: /^Clips Book/ }).click()
  const section = page.frameLocator('iframe')
  await expect(section.getByRole('heading', { name: 'Clips Chapter' })).toBeVisible()
  await page.waitForTimeout(200)
  await expect(page.getByRole('dialog', { name: 'Interactive features' })).not.toBeVisible()
  await section.getByText('Play the first clip').click()
  await page.waitForTimeout(400)
  expect(await audioState(page)).toEqual({ paused: true, currentTime: 0 })
})
