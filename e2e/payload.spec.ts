import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { BASIC_LTR, readingFraction } from './helpers'

// Simulates a publishing tool (docs/PAYLOAD_SLOT.md): plain text substitution
// of the empty slot in the served HTML — nothing else changes.
const SLOT = '<script type="application/epub+zip;base64" id="readhtml-payload"></script>'

function slotWith(content: string): string {
  return SLOT.replace('></script>', `>${content}</script>`)
}

async function servePayload(page: Page, content: string) {
  // Predicate, not a glob: '**/' would not match '/?catalog=...'.
  await page.route(
    (url) => url.pathname === '/',
    async (route) => {
      const response = await route.fetch()
      const html = await response.text()
      expect(html).toContain(SLOT)
      await route.fulfill({ response, body: html.replace(SLOT, slotWith(content)) })
    },
  )
}

const base64Of = (path: string) => readFileSync(path).toString('base64')

test('a payload boots straight into the book, ignoring query params', async ({ page }) => {
  await servePayload(page, base64Of(BASIC_LTR))
  await page.goto('/?catalog=http://127.0.0.1:4174/catalog.xml')
  const section = page.frameLocator('iframe')
  await expect(section.getByRole('heading', { name: 'Chapter One' })).toBeVisible()
  // No library, no catalog browser: the payload won.
  await expect(page.getByText('Open a book')).not.toBeVisible()
  await expect(page.getByRole('heading', { name: 'Fixture Catalog' })).not.toBeVisible()
})

test('embedded position round-trips across reload; the library gains no record', async ({
  page,
}) => {
  await servePayload(page, base64Of(BASIC_LTR))
  await page.goto('/')
  await expect(
    page.frameLocator('iframe').getByRole('heading', { name: 'Chapter One' }),
  ).toBeVisible()
  const start = (await readingFraction(page)) ?? 0
  const next = async () => {
    await page.getByRole('button', { name: 'Next page' }).click()
    return readingFraction(page)
  }
  await expect.poll(next).toBeGreaterThan(start)
  const advanced = (await readingFraction(page)) ?? 0
  await page.waitForTimeout(700) // let the debounced position write land

  await page.reload()
  await expect(
    page.frameLocator('iframe').getByRole('heading', { name: 'Chapter One' }),
  ).toBeAttached()
  await expect.poll(() => readingFraction(page)).toBeCloseTo(advanced, 2)

  // The dedicated key holds the position; the library metadata store none.
  const stored = await page.evaluate(() => ({
    payloadPositions: localStorage.getItem('readhtml_payload_positions'),
  }))
  expect(stored.payloadPositions).toContain('epubcfi(')

  // Back in the library (via the toolbar), no ghost record exists.
  await page.getByRole('button', { name: 'Library' }).click()
  await expect(page.getByText('Open a book')).toBeVisible()
  await expect(page.getByRole('listitem')).toHaveCount(0)
})

test('embedded scripted book runs without a prompt; trust is not recorded', async ({ page }) => {
  const clips = 'fixtures/build/scripted-clips.epub'
  await servePayload(page, base64Of(clips))
  await page.goto('/')
  const section = page.frameLocator('iframe')
  await expect(section.getByRole('heading', { name: 'Clips Chapter' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Interactive features' })).not.toBeVisible()
  // The book script ran: it primes the audio element at startup.
  await expect
    .poll(async () => section.locator('audio').evaluate((el) => (el as HTMLAudioElement).src))
    .toMatch(/^blob:/)

  // A normal import of the same book on a clean page still prompts: the
  // payload session recorded no consent.
  await page.unrouteAll()
  await page.goto('/')
  await page.setInputFiles('input[type=file]', clips)
  await expect(section.getByRole('heading', { name: 'Clips Chapter' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Interactive features' })).toBeVisible()
})

test('an undecodable payload shows the unreadable-book error, not a blank page', async ({
  page,
}) => {
  await servePayload(page, 'this is *not* base64###')
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('could not be opened')
  await expect(page.getByText('Open a book')).toBeVisible()
})
