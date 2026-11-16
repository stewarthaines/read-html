import { expect, type FrameLocator, type Page } from '@playwright/test'

export const BASIC_LTR = 'fixtures/build/basic-ltr.epub'

type ViewElement = Element & { lastLocation?: { fraction: number } }

export const readingFraction = (page: Page) =>
  page.evaluate(
    () => (document.querySelector('foliate-view') as ViewElement | null)?.lastLocation?.fraction,
  )

export async function openFixture(page: Page, fixture = BASIC_LTR): Promise<FrameLocator> {
  await page.goto('/')
  await importFixture(page, fixture)
  const section = page.frameLocator('iframe')
  await expect(section.getByRole('heading', { name: 'Chapter One' })).toBeVisible()
  return section
}

/** Imports via the file picker from the library screen (no goto). */
export async function importFixture(page: Page, fixture = BASIC_LTR): Promise<void> {
  await page.setInputFiles('input[type=file]', fixture)
}

/**
 * Start each page with the contents unpinned, for tests of the drawer: a
 * wide window otherwise pins them by default. Only an absent settings record
 * is seeded, so a choice a test makes (and a reload) is kept.
 */
export function startUnpinned(test: {
  beforeEach: (fn: (args: { page: Page }) => Promise<void>) => void
}): void {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('readhtml_settings')) {
        localStorage.setItem('readhtml_settings', JSON.stringify({ tocPin: 'unpinned' }))
      }
    })
  })
}
