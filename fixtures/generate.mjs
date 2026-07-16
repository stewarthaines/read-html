// Deterministic EPUB fixture generator. Zero npm dependencies: every ZIP entry
// is STORED (no compression), which is valid per the EPUB OCF spec and avoids
// needing a deflate implementation. Output is byte-identical across runs.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const outDir = fileURLToPath(new URL('build/', import.meta.url))

// --- CRC-32 (standard table-driven algorithm, reflected polynomial 0xEDB88320) ---

const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c >>> 0
}

/** @param {Uint8Array} data */
function crc32(data) {
  let c = 0xffffffff
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// --- ZIP writer (all entries STORED, ASCII filenames only) ---

// Fixed MS-DOS timestamp (2026-01-01 00:00:00) so output is deterministic.
const DOS_TIME = 0
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1

/** @typedef {{ name: string, data: string | Uint8Array }} ZipEntry */

/**
 * Builds a ZIP archive per the EPUB OCF container rules: callers must pass the
 * `mimetype` entry first — it is STORED with no extra field, so readers can
 * sniff `application/epub+zip` at a fixed byte offset in the file.
 * @param {ZipEntry[]} entries
 * @returns {Buffer}
 */
function buildZip(entries) {
  /** @type {Buffer[]} */
  const localParts = []
  /** @type {Buffer[]} */
  const centralParts = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'ascii')
    const data =
      typeof entry.data === 'string' ? Buffer.from(entry.data, 'utf8') : Buffer.from(entry.data)
    const crc = crc32(data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0) // local file header signature
    local.writeUInt16LE(20, 4) // version needed to extract
    local.writeUInt16LE(0, 6) // general purpose bit flags
    local.writeUInt16LE(0, 8) // compression method: STORED
    local.writeUInt16LE(DOS_TIME, 10)
    local.writeUInt16LE(DOS_DATE, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18) // compressed size (== uncompressed for STORED)
    local.writeUInt32LE(data.length, 22) // uncompressed size
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28) // extra field length
    localParts.push(local, name, data)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0) // central directory header signature
    central.writeUInt16LE(20, 4) // version made by
    central.writeUInt16LE(20, 6) // version needed to extract
    central.writeUInt16LE(0, 8) // general purpose bit flags
    central.writeUInt16LE(0, 10) // compression method: STORED
    central.writeUInt16LE(DOS_TIME, 12)
    central.writeUInt16LE(DOS_DATE, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(name.length, 28)
    // extra (30), comment (32), disk number (34), internal (36) and external (38)
    // attributes are all zero from Buffer.alloc
    central.writeUInt32LE(offset, 42) // offset of local file header
    centralParts.push(central, name)

    offset += 30 + name.length + data.length
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0) // end of central directory signature
  eocd.writeUInt16LE(entries.length, 8) // entries on this disk
  eocd.writeUInt16LE(entries.length, 10) // total entries
  eocd.writeUInt32LE(centralSize, 12)
  eocd.writeUInt32LE(offset, 16) // offset of central directory
  return Buffer.concat([...localParts, ...centralParts, eocd])
}

// --- Book definitions ---

const CONTAINER_XML = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`

const PARAGRAPH_BODY =
  'The steady lamp burned on the desk while rain traced slow lines down the window glass. ' +
  'The reader turned the page and the story went on as before.'

/**
 * @param {string} title
 * @param {number} paragraphCount
 */
function chapterXhtml(title, paragraphCount) {
  /** @type {string[]} */
  const paragraphs = []
  for (let i = 1; i <= paragraphCount; i++) {
    paragraphs.push(`    <p>Paragraph ${i} of ${title}. ${PARAGRAPH_BODY}</p>`)
  }
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>${title}</title>
  </head>
  <body>
    <h1>${title}</h1>
${paragraphs.join('\n')}
  </body>
</html>
`
}

/**
 * @param {string} title
 * @param {{ label: string, href: string }[]} tocItems
 */
function navXhtml(title, tocItems) {
  const items = tocItems
    .map(({ label, href }) => `        <li><a href="${href}">${label}</a></li>`)
    .join('\n')
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head>
    <title>${title}</title>
  </head>
  <body>
    <nav epub:type="toc">
      <h1>Contents</h1>
      <ol>
${items}
      </ol>
    </nav>
  </body>
</html>
`
}

/**
 * @param {string} title
 * @param {string} background
 */
function coverSvg(title, background) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
  <rect width="400" height="600" fill="${background}"/>
  <text x="200" y="300" fill="#ffffff" font-family="system-ui, sans-serif" font-size="36" text-anchor="middle" dominant-baseline="middle">${title}</text>
</svg>
`
}

/** @typedef {{ filename: string, entries: ZipEntry[] }} Book */

/** @returns {Book} */
function basicLtr() {
  const title = 'Basic LTR'
  const chapters = [
    { file: 'chapter1.xhtml', title: 'Chapter One' },
    { file: 'chapter2.xhtml', title: 'Chapter Two' },
    { file: 'chapter3.xhtml', title: 'Chapter Three' },
  ]

  const manifestItems = [
    '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '    <item id="cover" href="cover.svg" media-type="image/svg+xml" properties="cover-image"/>',
    ...chapters.map(
      (chapter, i) =>
        `    <item id="chapter${i + 1}" href="${chapter.file}" media-type="application/xhtml+xml"/>`,
    ),
  ].join('\n')
  const spineItems = chapters.map((_, i) => `    <itemref idref="chapter${i + 1}"/>`).join('\n')

  const packageOpf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">urn:uuid:00000000-0000-0000-0000-000000000001</dc:identifier>
    <dc:title>${title}</dc:title>
    <dc:creator>Fixture Author</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
${manifestItems}
  </manifest>
  <spine>
${spineItems}
  </spine>
</package>
`

  return {
    filename: 'basic-ltr.epub',
    entries: [
      // The mimetype entry must come first, exactly this content, no newline.
      { name: 'mimetype', data: 'application/epub+zip' },
      { name: 'META-INF/container.xml', data: CONTAINER_XML },
      { name: 'OEBPS/package.opf', data: packageOpf },
      {
        name: 'OEBPS/nav.xhtml',
        data: navXhtml(
          title,
          chapters.map((chapter) => ({ label: chapter.title, href: chapter.file })),
        ),
      },
      { name: 'OEBPS/cover.svg', data: coverSvg(title, '#335577') },
      ...chapters.map((chapter) => ({
        name: `OEBPS/${chapter.file}`,
        data: chapterXhtml(chapter.title, 16),
      })),
    ],
  }
}

const books = [basicLtr]

mkdirSync(outDir, { recursive: true })
for (const makeBook of books) {
  const { filename, entries } = makeBook()
  const path = join(outDir, filename)
  writeFileSync(path, buildZip(entries))
  console.log(`wrote ${path}`)
}
