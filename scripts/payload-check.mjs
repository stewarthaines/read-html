// @ts-check
// Built-file interface guarantees for hosting/publishing tools: the payload
// slot (docs/PAYLOAD_SLOT.md), the readhtml-version meta, and the web-app
// manifest link (docs/PWA_MANIFEST.md) each survive the build and appear
// exactly once in both targets. Tools do plain text substitution / rely on
// these exact bytes.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SLOT = '<script type="application/epub+zip;base64" id="readhtml-payload"></script>'
// Host-provided manifest (docs/PWA_MANIFEST.md): a relative href, so it
// resolves against wherever the file is served; the repo ships no manifest.
const MANIFEST_HREF = 'href="READ.webmanifest"'
const MANIFEST_REL = 'rel="manifest"'

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
  const manifests = html.split(MANIFEST_HREF).length - 1
  if (manifests !== 1 || !html.includes(MANIFEST_REL)) {
    console.error(
      `payload-check FAILED: ${target} must carry exactly one manifest link (${MANIFEST_REL} ${MANIFEST_HREF}); found href x${manifests}`,
    )
    failed = true
  }
}

if (failed) process.exit(1)
console.log(
  `payload-check OK: slot, version ${pkg.version}, and manifest link present exactly once in both targets`,
)
