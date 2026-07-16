import { expect, type FrameLocator, type Page } from '@playwright/test'

const BASIC_LTR = 'fixtures/build/basic-ltr.epub'

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
