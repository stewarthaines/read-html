// @ts-check
// Deterministic EPUB fixture generator. Zero npm dependencies: every ZIP entry
// is STORED (no compression), which is valid per the EPUB OCF spec and avoids
// needing a deflate implementation. Output is byte-identical across runs.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
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

const PARAGRAPH_BODY_AR =
  'جلس القارئ قرب النافذة والمطر يرسم خطوطاً بطيئة على الزجاج، ثم قلب الصفحة ومضت الحكاية كما كانت.'

/**
 * @param {string} title
 * @param {number} paragraphCount
 * @param {{ htmlAttrs?: string, paragraphText?: (i: number) => string }} [options]
 */
function chapterXhtml(title, paragraphCount, options = {}) {
  const htmlAttrs = options.htmlAttrs ?? ''
  const paragraphText =
    options.paragraphText ??
    ((/** @type {number} */ i) => `Paragraph ${i} of ${title}. ${PARAGRAPH_BODY}`)
  /** @type {string[]} */
  const paragraphs = []
  for (let i = 1; i <= paragraphCount; i++) {
    paragraphs.push(`    <p>${paragraphText(i)}</p>`)
  }
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"${htmlAttrs}>
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
 * @param {{ htmlAttrs?: string, heading?: string }} [options]
 */
function navXhtml(title, tocItems, options = {}) {
  const htmlAttrs = options.htmlAttrs ?? ''
  const heading = options.heading ?? 'Contents'
  const items = tocItems
    .map(({ label, href }) => `        <li><a href="${href}">${label}</a></li>`)
    .join('\n')
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"${htmlAttrs}>
  <head>
    <title>${title}</title>
  </head>
  <body>
    <nav epub:type="toc">
      <h1>${heading}</h1>
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

/**
 * @param {{
 *   identifier: string,
 *   title: string,
 *   creator: string,
 *   language: string,
 *   chapters: { file: string, properties?: string, spineProperties?: string }[],
 *   spineAttrs?: string,
 *   extraManifest?: string[],
 *   coverHref?: string,
 * }} meta
 */
function packageOpf({
  identifier,
  title,
  creator,
  language,
  chapters,
  spineAttrs = '',
  extraManifest = [],
  coverHref = 'cover.svg',
}) {
  const manifestItems = [
    '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    `    <item id="cover" href="${coverHref}" media-type="image/svg+xml" properties="cover-image"/>`,
    ...chapters.map(
      (chapter, i) =>
        `    <item id="chapter${i + 1}" href="${chapter.file}" media-type="application/xhtml+xml"${
          chapter.properties ? ` properties="${chapter.properties}"` : ''
        }/>`,
    ),
    ...extraManifest,
  ].join('\n')
  const spineItems = chapters
    .map(
      (chapter, i) =>
        `    <itemref idref="chapter${i + 1}"${
          chapter.spineProperties ? ` properties="${chapter.spineProperties}"` : ''
        }/>`,
    )
    .join('\n')

  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">${identifier}</dc:identifier>
    <dc:title>${title}</dc:title>
    <dc:creator>${creator}</dc:creator>
    <dc:language>${language}</dc:language>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
${manifestItems}
  </manifest>
  <spine${spineAttrs}>
${spineItems}
  </spine>
</package>
`
}

/** @typedef {{ filename: string, entries: ZipEntry[] }} Book */
/** @typedef {{ filename: string, file: string }} PlainFile */

/** @returns {Book} */
function basicLtr() {
  const title = 'Basic LTR'
  const chapters = [
    { file: 'chapter1.xhtml', title: 'Chapter One' },
    { file: 'chapter2.xhtml', title: 'Chapter Two' },
    { file: 'chapter3.xhtml', title: 'Chapter Three' },
  ]

  return {
    filename: 'basic-ltr.epub',
    entries: [
      // The mimetype entry must come first, exactly this content, no newline.
      { name: 'mimetype', data: 'application/epub+zip' },
      { name: 'META-INF/container.xml', data: CONTAINER_XML },
      {
        name: 'OEBPS/package.opf',
        data: packageOpf({
          identifier: 'urn:uuid:00000000-0000-0000-0000-000000000001',
          title,
          creator: 'Fixture Author',
          language: 'en',
          chapters,
        }),
      },
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

/** @returns {Book} */
function rtlBook() {
  const title = 'كتاب تجريبي'
  const chapters = [
    { file: 'chapter1.xhtml', title: 'الفصل الأول' },
    { file: 'chapter2.xhtml', title: 'الفصل الثاني' },
    { file: 'chapter3.xhtml', title: 'الفصل الثالث' },
  ]

  return {
    filename: 'rtl-book.epub',
    entries: [
      // The mimetype entry must come first, exactly this content, no newline.
      { name: 'mimetype', data: 'application/epub+zip' },
      { name: 'META-INF/container.xml', data: CONTAINER_XML },
      {
        name: 'OEBPS/package.opf',
        data: packageOpf({
          identifier: 'urn:uuid:00000000-0000-0000-0000-000000000002',
          title,
          creator: 'مؤلف الكتاب',
          language: 'ar',
          chapters,
          spineAttrs: ' page-progression-direction="rtl"',
        }),
      },
      {
        name: 'OEBPS/nav.xhtml',
        data: navXhtml(
          title,
          chapters.map((chapter) => ({ label: chapter.title, href: chapter.file })),
          { htmlAttrs: ' dir="rtl"', heading: 'المحتويات' },
        ),
      },
      { name: 'OEBPS/cover.svg', data: coverSvg('كتاب', '#553366') },
      ...chapters.map((chapter) => ({
        name: `OEBPS/${chapter.file}`,
        data: chapterXhtml(chapter.title, 16, {
          htmlAttrs: ' dir="rtl" xml:lang="ar" lang="ar"',
          paragraphText: (i) => `الفقرة ${i} من ${chapter.title}. ${PARAGRAPH_BODY_AR}`,
        }),
      })),
    ],
  }
}

// --- Scripted fixtures (§6): the publisher content contract, and a hostile book ---

/**
 * Deterministic WAV: mono 8-bit PCM, 8000 Hz, 2.0 s, 440 Hz sine.
 * @returns {Buffer}
 */
function wavTone() {
  const sampleRate = 8000
  const sampleCount = sampleRate * 2
  const wav = Buffer.alloc(44 + sampleCount)
  wav.write('RIFF', 0, 'ascii')
  wav.writeUInt32LE(36 + sampleCount, 4)
  wav.write('WAVE', 8, 'ascii')
  wav.write('fmt ', 12, 'ascii')
  wav.writeUInt32LE(16, 16) // fmt chunk size
  wav.writeUInt16LE(1, 20) // PCM
  wav.writeUInt16LE(1, 22) // mono
  wav.writeUInt32LE(sampleRate, 24)
  wav.writeUInt32LE(sampleRate, 28) // byte rate (8-bit mono)
  wav.writeUInt16LE(1, 32) // block align
  wav.writeUInt16LE(8, 34) // bits per sample
  wav.write('data', 36, 'ascii')
  wav.writeUInt32LE(sampleCount, 40)
  for (let i = 0; i < sampleCount; i++) {
    wav[44 + i] = Math.round(128 + 63 * Math.sin((2 * Math.PI * 440 * i) / sampleRate))
  }
  return wav
}

const CLIP_STYLE = `span.clip {
  border-bottom: 2px dotted currentColor;
  cursor: pointer;
  /* Empty url() reproduces a real-book crash: foliate resolves it to the
     stylesheet itself, the circular-reference guard loads it as a Blob, and
     the paginator's CSS hook choked on the non-string (vendor patch 4). */
  background-image: url();
}
span.clip.clip-playing {
  outline: 2px solid currentColor;
}
`

// The contract player (docs/CONTENT_CONVENTIONS.md), verbatim: resolves
// data-src relative to the chapter unless it already carries a URL scheme,
// plays every clip through the one static <audio>, toggles clip-playing,
// publishes --clip-duration.
const PLAYER_JS = `// Book player script implementing the READ.html content contract
// (docs/CONTENT_CONVENTIONS.md): clip spans play ranges of one shared
// static <audio> element. Linked from <head>, so it waits for the DOM.
;(function () {
  'use strict'
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }

  function init() {
  var audio = document.getElementById('clip-audio')
  if (!audio) return
  var active = null
  var stopAt = Infinity

  // Eagerly resolve the first clip at startup, like real players that prime
  // the shared element before any tap. In READ.html this requires data-src
  // to carry a URL scheme BEFORE book scripts run; if it is still relative,
  // resolveSrc below throws against the blob: base and the player never
  // wires its click handler — a loud regression.
  var firstClip = document.querySelector('span.clip[data-src]')
  if (firstClip) audio.src = resolveSrc(firstClip.getAttribute('data-src'))

  function parseTime(value) {
    if (!value) return 0
    var parts = String(value).split(':')
    var seconds = 0
    for (var i = 0; i < parts.length; i++) seconds = seconds * 60 + parseFloat(parts[i])
    return seconds
  }

  function resolveSrc(value) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value
    return new URL(value, document.baseURI).href
  }

  function stop() {
    audio.pause()
    if (active) active.classList.remove('clip-playing')
    active = null
  }

  audio.addEventListener('timeupdate', function () {
    if (active && audio.currentTime >= stopAt) stop()
  })

  document.addEventListener('click', function (event) {
    var span = event.target.closest('span.clip')
    if (!span) return
    var begin = parseTime(span.getAttribute('data-begin'))
    var end = span.getAttribute('data-end')
    stopAt = end ? parseTime(end) : Infinity
    var src = resolveSrc(span.getAttribute('data-src'))
    if (audio.src !== src) audio.src = src
    audio.playbackRate = parseFloat(span.getAttribute('data-rate') || '1')
    if (active) active.classList.remove('clip-playing')
    active = span
    span.classList.add('clip-playing')
    span.style.setProperty('--clip-duration', String(Math.max(0, stopAt - begin)) + 's')
    audio.currentTime = begin
    audio.play()
  })
  }
})()
`

const CLIPS_CHAPTER = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>Clips Chapter</title>
    <link rel="stylesheet" type="text/css" href="style.css"/>
    <script src="player.js"></script>
  </head>
  <body>
    <h1>Clips Chapter</h1>
    <p>This chapter has audio clips. Tap a clip to play it.</p>
    <p><span class="clip" data-src="audio/tone.wav" data-begin="0" data-end="1">Play the first clip</span></p>
    <p><span class="clip" data-src="audio/tone.wav" data-begin="1" data-end="2" data-rate="1">Play the second clip</span></p>
    <p><span class="clip" data-src="missing/nowhere.mp3" data-begin="0" data-end="1">Broken clip</span></p>
    <audio id="clip-audio" src="audio/tone.wav" preload="auto"></audio>
  </body>
</html>
`

const HOSTILE_CHAPTER = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>Hostile Chapter</title>
  </head>
  <body onload="localStorage.setItem('readhtml_hostile_onload', 'executed')">
    <h1>Hostile Chapter</h1>
    <p>This book attempts to write to storage when its scripts run.</p>
    <script>try { localStorage.setItem('readhtml_hostile_marker', 'executed') } catch (e) {}</script>
  </body>
</html>
`

/** @returns {Book} */
function scriptedClips() {
  const title = 'Clips Book'
  return {
    filename: 'scripted-clips.epub',
    entries: [
      // The mimetype entry must come first, exactly this content, no newline.
      { name: 'mimetype', data: 'application/epub+zip' },
      { name: 'META-INF/container.xml', data: CONTAINER_XML },
      {
        name: 'OEBPS/package.opf',
        data: packageOpf({
          identifier: 'urn:uuid:00000000-0000-0000-0000-000000000003',
          title,
          creator: 'Fixture Author',
          language: 'en',
          // The publisher contract (§8) declares scripted on the spine
          // itemref; the EPUB 3 spec puts it on the manifest item. Both.
          chapters: [
            { file: 'chapter1.xhtml', properties: 'scripted', spineProperties: 'scripted' },
          ],
          extraManifest: [
            '    <item id="style" href="style.css" media-type="text/css"/>',
            '    <item id="player" href="player.js" media-type="application/javascript"/>',
            '    <item id="tone" href="audio/tone.wav" media-type="audio/wav"/>',
          ],
        }),
      },
      {
        name: 'OEBPS/nav.xhtml',
        data: navXhtml(title, [{ label: 'Clips Chapter', href: 'chapter1.xhtml' }]),
      },
      { name: 'OEBPS/cover.svg', data: coverSvg('Clips', '#336655') },
      { name: 'OEBPS/chapter1.xhtml', data: CLIPS_CHAPTER },
      { name: 'OEBPS/style.css', data: CLIP_STYLE },
      { name: 'OEBPS/player.js', data: PLAYER_JS },
      { name: 'OEBPS/audio/tone.wav', data: wavTone() },
    ],
  }
}

/** @returns {Book} */
function hostileBook() {
  const title = 'Hostile Book'
  return {
    filename: 'scripted-hostile.epub',
    entries: [
      // The mimetype entry must come first, exactly this content, no newline.
      { name: 'mimetype', data: 'application/epub+zip' },
      { name: 'META-INF/container.xml', data: CONTAINER_XML },
      {
        name: 'OEBPS/package.opf',
        data: packageOpf({
          identifier: 'urn:uuid:00000000-0000-0000-0000-000000000004',
          title,
          creator: 'Fixture Author',
          language: 'en',
          chapters: [
            { file: 'chapter1.xhtml', properties: 'scripted', spineProperties: 'scripted' },
          ],
        }),
      },
      {
        name: 'OEBPS/nav.xhtml',
        data: navXhtml(title, [{ label: 'Hostile Chapter', href: 'chapter1.xhtml' }]),
      },
      { name: 'OEBPS/cover.svg', data: coverSvg('Hostile', '#663333') },
      { name: 'OEBPS/chapter1.xhtml', data: HOSTILE_CHAPTER },
    ],
  }
}

/** @returns {Book} */
function spacesInName() {
  const title = 'Spaces In Name'
  // ZIP entry names carry LITERAL spaces; OPF/nav hrefs reference them
  // percent-encoded (hrefs are URLs; ZIP entry names are not). Readers must
  // decode the href before looking up the container entry.
  const chapters = [
    { file: 'chapter%20one.xhtml', zipName: 'chapter one.xhtml', title: 'Chapter One' },
    { file: 'chapter%20two.xhtml', zipName: 'chapter two.xhtml', title: 'Chapter Two' },
  ]

  return {
    filename: 'spaces in name.epub',
    entries: [
      // The mimetype entry must come first, exactly this content, no newline.
      { name: 'mimetype', data: 'application/epub+zip' },
      { name: 'META-INF/container.xml', data: CONTAINER_XML },
      {
        name: 'OEBPS/package.opf',
        data: packageOpf({
          identifier: 'urn:uuid:00000000-0000-0000-0000-000000000005',
          title,
          creator: 'Fixture Author',
          language: 'en',
          chapters,
          coverHref: 'cover%20image.svg',
        }),
      },
      {
        name: 'OEBPS/nav.xhtml',
        data: navXhtml(
          title,
          chapters.map((chapter) => ({ label: chapter.title, href: chapter.file })),
        ),
      },
      { name: 'OEBPS/cover image.svg', data: coverSvg('Spaces', '#556633') },
      ...chapters.map((chapter) => ({
        name: `OEBPS/${chapter.zipName}`,
        data: chapterXhtml(chapter.title, 16),
      })),
    ],
  }
}

// --- Standalone (non-ZIP) fixtures: an OPDS catalog and a loose cover ---

const CATALOG_XML = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <title>Fixture Catalog</title>
  <id>urn:uuid:00000000-0000-0000-0000-00000000c001</id>
  <updated>2026-01-01T00:00:00Z</updated>
  <entry>
    <title>Spaces In Name</title>
    <id>urn:uuid:00000000-0000-0000-0000-000000000005</id>
    <dc:identifier>urn:uuid:00000000-0000-0000-0000-000000000005</dc:identifier>
    <updated>2026-01-01T00:00:00Z</updated>
    <author><name>Fixture Author</name></author>
    <summary>A book whose file name and internal hrefs contain spaces.</summary>
    <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="spaces%20in%20name.epub"/>
    <link rel="http://opds-spec.org/image" type="image/svg+xml" href="covers/spaces%20cover.svg"/>
  </entry>
  <entry>
    <title>Basic LTR</title>
    <id>urn:uuid:00000000-0000-0000-0000-000000000001</id>
    <dc:identifier>urn:uuid:00000000-0000-0000-0000-000000000001</dc:identifier>
    <updated>2026-01-01T00:00:00Z</updated>
    <author><name>Fixture Author</name></author>
    <summary>A plain three-chapter book.</summary>
    <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="basic-ltr.epub"/>
  </entry>
  <entry>
    <title>Clips Book</title>
    <id>urn:uuid:00000000-0000-0000-0000-000000000003</id>
    <dc:identifier>urn:uuid:00000000-0000-0000-0000-000000000003</dc:identifier>
    <updated>2026-01-01T00:00:00Z</updated>
    <author><name>Fixture Author</name></author>
    <summary>A scripted book with audio clips.</summary>
    <link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="scripted-clips.epub"/>
  </entry>
</feed>
`

/** @returns {PlainFile} */
function opdsCatalog() {
  return { filename: 'catalog.xml', file: CATALOG_XML }
}

/** @returns {PlainFile} */
function spacesCover() {
  return { filename: 'covers/spaces cover.svg', file: coverSvg('Spaces', '#556633') }
}

// --- Edge-case books (§6): minimal FXL, and missing-metadata fallbacks ---

const FXL_OPF = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" prefix="rendition: http://www.idpf.org/vocab/rendition/#">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">urn:uuid:00000000-0000-0000-0000-000000000006</dc:identifier>
    <dc:title>Fixed Layout</dc:title>
    <dc:creator>Fixture Author</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
    <meta property="rendition:layout">pre-paginated</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="page1" href="page1.xhtml" media-type="application/xhtml+xml"/>
    <item id="page2" href="page2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="page1"/>
    <itemref idref="page2"/>
  </spine>
</package>
`

/**
 * @param {string} title
 * @param {string} body
 */
function fxlPage(title, body) {
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>${title}</title>
    <meta name="viewport" content="width=400, height=600"/>
  </head>
  <body style="width: 400px; height: 600px; margin: 0;">
    <h1 style="position: absolute; top: 40px; left: 40px;">${title}</h1>
    <p style="position: absolute; top: 120px; left: 40px; width: 320px;">${body}</p>
  </body>
</html>
`
}

/** @returns {Book} */
function fixedLayout() {
  return {
    filename: 'fixed-layout.epub',
    entries: [
      // The mimetype entry must come first, exactly this content, no newline.
      { name: 'mimetype', data: 'application/epub+zip' },
      { name: 'META-INF/container.xml', data: CONTAINER_XML },
      { name: 'OEBPS/package.opf', data: FXL_OPF },
      {
        name: 'OEBPS/nav.xhtml',
        data: navXhtml('Fixed Layout', [{ label: 'Page One', href: 'page1.xhtml' }]),
      },
      { name: 'OEBPS/page1.xhtml', data: fxlPage('Page One', 'A fixed-layout page.') },
      { name: 'OEBPS/page2.xhtml', data: fxlPage('Page Two', 'Another fixed-layout page.') },
    ],
  }
}

// No dc:title, no dc:creator, no cover: the reader's fallbacks are the point.
const NO_METADATA_OPF = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">urn:uuid:00000000-0000-0000-0000-000000000007</dc:identifier>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="chapter1"/>
  </spine>
</package>
`

/** @returns {Book} */
function noMetadata() {
  return {
    filename: 'no-metadata.epub',
    entries: [
      // The mimetype entry must come first, exactly this content, no newline.
      { name: 'mimetype', data: 'application/epub+zip' },
      { name: 'META-INF/container.xml', data: CONTAINER_XML },
      { name: 'OEBPS/package.opf', data: NO_METADATA_OPF },
      {
        name: 'OEBPS/nav.xhtml',
        data: navXhtml('Contents', [{ label: 'The Only Chapter', href: 'chapter1.xhtml' }]),
      },
      { name: 'OEBPS/chapter1.xhtml', data: chapterXhtml('The Only Chapter', 8) },
    ],
  }
}

// Long TOC labels (and one unbreakable slug) to prove the drawer wraps them
// instead of stretching to the longest entry.
/** @returns {Book} */
function longToc() {
  const title = 'Long Titles'
  // Enough entries, several wrapping to two lines, to overflow the drawer
  // vertically — so the last one being reachable (not clipped) is testable.
  const titles = [
    'Ethnomusicological Life in Georgia (July to December 2025)',
    'Nanina UK Tour',
    'Forty-Three Years of Inspiration from Georgian Singing',
    'The Return of Meskhetian Archival Materials to Performing Practice',
    'Innovative Collection of Songs from the Repertoire of Ensemble Nanina',
    'Georgian Folk Song in the United Kingdom',
    'Folk Ensemble Mzeshina from Telavi in Kakheti',
    'Voices of the Ancestors: An Archive of Women Georgian Song',
    'Chanting, Ghighini, Krimanchuli, Singing',
    'The Tradition of Batonebi in Meskheti',
    'batonebis_mamidasa_score_supplementary_materials_appendix',
    'Imprint',
  ]
  const chapters = titles.map((title, i) => ({ file: `chapter${i + 1}.xhtml`, title }))
  return {
    filename: 'long-toc.epub',
    entries: [
      // The mimetype entry must come first, exactly this content, no newline.
      { name: 'mimetype', data: 'application/epub+zip' },
      { name: 'META-INF/container.xml', data: CONTAINER_XML },
      {
        name: 'OEBPS/package.opf',
        data: packageOpf({
          identifier: 'urn:uuid:00000000-0000-0000-0000-000000000008',
          title,
          creator: 'Fixture Author',
          language: 'en',
          chapters,
        }),
      },
      {
        name: 'OEBPS/nav.xhtml',
        data: navXhtml(
          title,
          chapters.map((chapter) => ({ label: chapter.title, href: chapter.file })),
        ),
      },
      { name: 'OEBPS/cover.svg', data: coverSvg('Long', '#445566') },
      ...chapters.map((chapter) => ({
        name: `OEBPS/${chapter.file}`,
        data: chapterXhtml(chapter.title, 8),
      })),
    ],
  }
}

const outputs = [
  basicLtr,
  rtlBook,
  scriptedClips,
  hostileBook,
  spacesInName,
  opdsCatalog,
  spacesCover,
  fixedLayout,
  noMetadata,
  longToc,
]

mkdirSync(outDir, { recursive: true })
for (const makeOutput of outputs) {
  const output = makeOutput()
  const path = join(outDir, output.filename)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, 'entries' in output ? buildZip(output.entries) : output.file)
  console.log(`wrote ${path}`)
}
