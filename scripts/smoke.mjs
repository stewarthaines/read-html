// Build verification (§2): boots the built hosted artifact (dist/) headlessly
// and asserts the shell renders. Build-config breakage is invisible to unit
// tests and dev-server e2e, so CI runs this after every build.
// The single-file READ.html target is added at M7 and will be smoked here too.
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const distDir = fileURLToPath(new URL('../dist', import.meta.url))

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
const origin = `http://127.0.0.1:${address.port}`

const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  const errors = /** @type {string[]} */ ([])
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto(origin, { waitUntil: 'load' })

  const title = await page.title()
  if (title !== 'READ.html') throw new Error(`smoke: expected title "READ.html", got "${title}"`)

  await page.locator('main').waitFor({ state: 'visible', timeout: 5000 })

  if (errors.length > 0) throw new Error(`smoke: page errors:\n${errors.join('\n')}`)
  console.log(`smoke OK: dist/ shell renders at ${origin}`)
} finally {
  await browser.close()
  server.close()
}
