// @ts-check
// Static server for fixtures/build during e2e (§7): serves the generated
// fixture EPUBs, the OPDS catalog, and cover assets with CORS enabled —
// paths under /no-cors/ serve the same files WITHOUT the CORS header, for
// asserting the reader's CORS error UX. Percent-encoded names (the spaces
// fixtures) are decoded to filesystem names.
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const buildDir = fileURLToPath(new URL('../fixtures/build', import.meta.url))
const port = Number(process.argv[2] ?? 4174)

const MIME = /** @type {Record<string, string>} */ ({
  '.epub': 'application/epub+zip',
  '.xml': 'application/atom+xml',
  '.svg': 'image/svg+xml',
})

const server = createServer((req, res) => {
  const rawPath = new URL(req.url ?? '/', 'http://localhost').pathname
  const noCors = rawPath.startsWith('/no-cors/')
  const decoded = decodeURIComponent(noCors ? rawPath.slice('/no-cors'.length) : rawPath)
  const path = normalize(join(buildDir, decoded))
  if (!path.startsWith(buildDir)) {
    res.writeHead(403)
    res.end()
    return
  }
  readFile(path)
    .then((body) => {
      /** @type {Record<string, string>} */
      const headers = { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' }
      if (!noCors) headers['access-control-allow-origin'] = '*'
      res.writeHead(200, headers)
      res.end(body)
    })
    .catch(() => {
      res.writeHead(404)
      res.end()
    })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`fixture server: http://127.0.0.1:${port} serving fixtures/build`)
})
