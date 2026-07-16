// @ts-check
// Engine-upgrade guard (§7): fails loudly if the two vendored foliate-js
// integration points READ.html depends on have changed. See
// vendor/foliate-js/VENDORED.md for the update procedure.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

export const INTEGRATION_POINTS = [
  {
    file: 'vendor/foliate-js/paginator.js',
    name: 'section iframe sandbox attribute',
    pattern: "this.#iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts')",
  },
  {
    file: 'vendor/foliate-js/epub.js',
    name: "Loader.createURL 'data' CustomEvent dispatch",
    pattern: "const event = new CustomEvent('data', { detail })",
  },
]

/**
 * Returns the integration points whose expected source line is no longer
 * present in the vendored file.
 * @param {(path: string) => string} readFile reads a repo-relative path; injectable for tests
 */
export function checkIntegrationPoints(
  readFile = (path) => readFileSync(resolve(repoRoot, path), 'utf8'),
) {
  return INTEGRATION_POINTS.filter((point) => !readFile(point.file).includes(point.pattern))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const changed = checkIntegrationPoints()
  if (changed.length > 0) {
    for (const point of changed) {
      console.error(`vendor-check FAILED: ${point.name} not found in ${point.file}`)
      console.error(`  expected line: ${point.pattern}`)
    }
    console.error('The vendored foliate-js integration points changed — see VENDORED.md.')
    process.exit(1)
  }
  console.log(`vendor-check OK: ${INTEGRATION_POINTS.length} integration points intact`)
}
