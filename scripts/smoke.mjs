// @ts-check
// Build verification (§2): boots each built artifact headlessly and asserts
// the shell renders — the hosted dist/ over HTTP and the single-file
// READ.html from file:// (its offline-from-disk contract). Build-config
// breakage is invisible to unit tests and dev-server e2e, so CI runs this
// after every build. Both artifacts must exist; run `npm run build` and
// `npm run build:single` first.
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'

const distDir = fileURLToPath(new URL('../dist', import.meta.url))
const singleFile = fileURLToPath(new URL('../dist-single/READ.html', import.meta.url))

const MIME = /** @type {Record<string, string>} */ ({
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
})

/** @param {string} urlPath */
async function readDistFile(urlPath) {
  const path = normalize(join(distDir, urlPath === '/' ? 'index.html' : urlPath))
  if (!path.startsWith(distDir)) throw new Error('path escapes dist/')
  return { body: await readFile(path), type: MIME[extname(path)] ?? 'application/octet-stream' }
}

/**
 * @param {import('@playwright/test').Browser} browser
 * @param {string} url
 * @param {string} label
 */
async function checkShell(browser, url, label) {
  const page = await browser.newPage()
  const errors = /** @type {string[]} */ ([])
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto(url, { waitUntil: 'load' })

  const title = await page.title()
  if (title !== 'READ.html')
    throw new Error(`smoke: ${label}: expected title "READ.html", got "${title}"`)
  await page.locator('main').waitFor({ state: 'visible', timeout: 5000 })
  if (errors.length > 0) throw new Error(`smoke: ${label}: page errors:\n${errors.join('\n')}`)
  await page.close()
  console.log(`smoke OK: ${label} shell renders (${url})`)
}

if (!existsSync(join(distDir, 'index.html')))
  throw new Error('smoke: dist/index.html missing — run `npm run build` first')
if (!existsSync(singleFile))
  throw new Error('smoke: dist-single/READ.html missing — run `npm run build:single` first')

const server = createServer((req, res) => {
  readDistFile(new URL(req.url ?? '/', 'http://localhost').pathname)
    .then(({ body, type }) => {
      res.writeHead(200, { 'content-type': type })
      res.end(body)
    })
    .catch(() => {
      res.writeHead(404)
      res.end()
    })
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)))
const address = /** @type {import('node:net').AddressInfo} */ (server.address())

// The single-file target's offline-from-disk claim is smoked in Chromium
// specifically: it was the engine that could not render a book from a
// file:-origin page until the srcdoc patch (VENDORED.md #6), so it is the
// meaningful regression guard.
/** @param {import('@playwright/test').Browser} browser */
async function checkBookOpensFromDisk(browser) {
  const fixture = fileURLToPath(new URL('../fixtures/build/basic-ltr.epub', import.meta.url))
  if (!existsSync(fixture))
    throw new Error('smoke: fixtures missing — run `node fixtures/generate.mjs` first')
  const page = await browser.newPage()
  await page.goto(pathToFileURL(singleFile).href, { waitUntil: 'load' })
  await page.setInputFiles('input[type=file]', fixture)
  await page
    .frameLocator('iframe[title="Book content"]')
    .getByRole('heading', { name: 'Chapter One' })
    .waitFor({ state: 'visible', timeout: 15000 })
  await page.close()
  console.log('smoke OK: READ.html (file://, Chromium) opens a book')
}

const browser = await chromium.launch()
try {
  await checkShell(browser, `http://127.0.0.1:${address.port}`, 'dist/')
  await checkShell(browser, pathToFileURL(singleFile).href, 'READ.html shell (file://)')
  await checkBookOpensFromDisk(browser)
} finally {
  await browser.close()
  server.close()
}
