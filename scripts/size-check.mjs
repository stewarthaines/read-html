// @ts-check
// M7 size budget: the single-file READ.html must stay under 1.5 MB (§5).
// CI runs this after build:single and fails the pipeline on breach; use
// `npm run analyze` to find what grew.
import { statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BUDGET_BYTES = 1.5 * 1024 * 1024
const target = fileURLToPath(new URL('../dist-single/READ.html', import.meta.url))

let size
try {
  size = statSync(target).size
} catch {
  console.error('size-check: dist-single/READ.html missing — run `npm run build:single` first')
  process.exit(1)
}

const pct = ((size / BUDGET_BYTES) * 100).toFixed(1)
if (size > BUDGET_BYTES) {
  console.error(`size-check FAILED: READ.html is ${size} bytes (${pct}% of the 1.5 MB budget)`)
  process.exit(1)
}
console.log(`size-check OK: READ.html is ${size} bytes (${pct}% of the 1.5 MB budget)`)
