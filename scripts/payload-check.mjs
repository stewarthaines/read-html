// @ts-check
// Payload-slot build guarantees (docs/PAYLOAD_SLOT.md): the slot marker
// survives the build byte-for-byte and appears exactly once in each build
// target, alongside the readhtml-version meta fed from package.json.
// Publishing tools do plain text substitution against these exact bytes.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SLOT = '<script type="application/epub+zip;base64" id="readhtml-payload"></script>'

const pkg = /** @type {{ version: string }} */ (
  JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
)
const VERSION_META = `<meta name="readhtml-version" content="${pkg.version}"`

const targets = ['dist/index.html', 'dist-single/READ.html']
let failed = false

for (const target of targets) {
  let html
  try {
    html = readFileSync(fileURLToPath(new URL(`../${target}`, import.meta.url)), 'utf8')
  } catch {
    console.error(`payload-check: ${target} missing — run both builds first`)
    process.exit(1)
  }
  const slots = html.split(SLOT).length - 1
  if (slots !== 1) {
    console.error(`payload-check FAILED: ${target} has ${slots} payload slots, expected exactly 1`)
    failed = true
  }
  if (!html.includes(VERSION_META)) {
    console.error(`payload-check FAILED: ${target} lacks ${VERSION_META}>`)
    failed = true
  }
}

if (failed) process.exit(1)
console.log(
  `payload-check OK: slot and version ${pkg.version} present exactly once in both targets`,
)
