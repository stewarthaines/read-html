# READ.html — feature spec

Living acceptance criteria, extracted from and subordinate to `docs/BOOTSTRAP.md` (the founding spec). Every feature lands as: (1) acceptance criteria here, (2) a failing e2e or unit test, (3) implementation to green.

## Embedded-payload slot (post-M7)

The published contract lives in `docs/PAYLOAD_SLOT.md`. Accepted when (build: `npm run payload-check`; e2e: `e2e/payload.spec.ts`; unit: `tests/payload.test.ts`):

- Both build targets carry the slot marker byte-for-byte, exactly once, plus the `readhtml-version` meta fed from `package.json` (now a real version, starting 1.0.0).
- A payload-carrying page boots straight into the book (e2e injects base64 into the served HTML exactly as a publishing tool would); `?book=`/`?catalog=` are ignored; an undecodable payload shows the standard unreadable-book error.
- The embedded book's scripts run with no consent prompt, and no consent grant is recorded anywhere — a subsequent normal import of the same book still prompts.
- Reading position round-trips across reload via the dedicated `readhtml_payload_positions` key; the library gains no record.

## M7 — ship

Accepted when all of the following hold (e2e: `e2e/degraded.spec.ts`, `e2e/edge-books.spec.ts`; unit: additions to `tests/storage.test.ts`):

- **Size budget**: CI fails if `dist-single/READ.html` exceeds 1.5 MB (`npm run size-check` after `build:single`).
- **Feature 11, storage degradation**: a third `BookStorage` backend keeps everything in memory; detection order is OPFS → IndexedDB (probed by actually opening the DB) → memory. The metadata store falls back to an in-memory map when IndexedDB fails. When storage is memory-only the app shows a notice that books and positions will not survive the session; importing and reading still work. e2e proves it by disabling `indexedDB`/`navigator.storage`; `file://` boot is covered by smoke (Chromium). Verified manually and documented per browser in the README where e2e cannot reach.
- **Fixtures (§6 completion)**: `fixed-layout.epub` (minimal FXL; rendering without crashing is the only v1 claim — e2e asserts it) and `no-metadata.epub` (title falls back to the file name, no author, no cover; e2e asserts the library fallbacks).
- **About panel (§3.8)**: settings carries the app name, one plain sentence, the MIT license, and a link to the source repository — nothing else.
- **README**: mission, hosted + single-file usage (READ.html downloadable from the site), deep links, catalogs with the CORS requirement documented prominently (§3.7), the scripting consent model and threat-model pointer, storage caveats (Safari seven-day eviction; `file://` and private-mode degradation), development guide, non-goals, MIT.
- **Deploy pipeline**: ~~on push to `main`, CI publishes to Cloudflare Pages~~ — superseded. READ.html is bundled into the SEED.html deployment at `readitinabook.com/read/`; this repo's CI builds and validates only, and the SEED.html pipeline publishes the built artifact. No Cloudflare secrets, no deploy step here.

## M6 — catalog

Accepted when all of the following hold (e2e: `e2e/catalog.spec.ts`; unit: `tests/catalog.test.ts`, `tests/saved-catalogs.test.ts`):

- Catalog view: add a catalog by URL (saving it), browse publications and navigation sub-feeds, covers from the feed's image links, download-to-library. Saved catalogs (localStorage `readhtml_catalogs`, key in `storage/keys.ts`, try/catch-wrapped) list with open, remove, and a per-catalog "Trust books from this catalog" toggle.
- **URL-encoding correctness (§3.7)**: feed hrefs are used exactly as given, resolved with `new URL(href, base)`, never re-encoded. Unit tests pin `%20` staying `%20` (not `%2520`); e2e downloads `spaces in name.epub` through the fixture catalog end-to-end and reads it (internal `%20` hrefs included).
- **No proxy; CORS is the publisher's job**: a failed catalog or book fetch shows a friendly error naming CORS as the likely cause. e2e asserts it against a no-CORS endpoint on the fixture server.
- Deep links, read once at startup then cleared from the URL: `?book=<url>` fetches and opens an EPUB (imported to the library); `?catalog=<url>` opens the catalog browser pre-loaded.
- Drag-drop import onto the library (per the M2 amendment), same pipeline as the picker.
- Trust-this-catalog (§3.4 step 4): books downloaded from a trusted catalog record `scriptingConsent: true` at import (never overriding an explicit revocation); e2e: the clips book via a trusted catalog opens with scripts running and no prompt.
- Fixtures (§6): `spaces in name.epub` (literal spaces in the zip names, `%20` in OPF/nav hrefs) and `catalog.xml` (OPDS 1.x Atom) whose acquisition hrefs carry `%20` and point at the real generated fixtures, plus a cover asset with a space in its name; served by the e2e fixture static server (CORS on, with a `/no-cors/` mirror).
- Accessibility: axe passes on the catalog view. Visual snapshot: catalog with the fixture feed loaded.

## M5 — scripts (consent gate, §3.4 end-to-end)

Accepted when all of the following hold (e2e: `e2e/scripts.spec.ts`; unit: `tests/consent.test.ts`, `tests/strip.test.ts`):

- **Threat model (stated per §3.4)**: consented book scripts run with the app origin's authority — the OPFS/IndexedDB library, localStorage, all of it. This is accepted by design for a trusted-publisher reader on a dedicated origin holding nothing but reading data; the consent gate exists so that authority is only ever granted explicitly, per book, by the reader.
  - **Amendment (post-M7, deployment change): the dedicated-origin premise no longer holds.** READ.html now ships at `readitinabook.com/read/`, sharing an origin with SEED.html — a path prefix is not an origin boundary, so a consented book's scripts run with authority over the **whole `readitinabook.com` origin's** script-writable storage, including SEED.html's, not just reading data. This is a genuine escalation of what "consent" grants and an open owner decision: options include (a) a real subdomain after all (restores the original isolation), (b) accepting it as trusted-publisher-only on a first-party tool, or (c) narrowing consent (e.g. payload-only trust, no per-book run on the shared origin). Until decided, the consent flow and the trusted-catalog auto-consent grant more than the original threat model contemplated.
- Detection: a book is scripted when any OPF spine itemref **or** manifest item carries `properties~="scripted"` (§8's publisher contract says spine; the EPUB 3 spec puts it on manifest items; both are honored).
- Consent decision matrix (unit-tested): non-scripted → strip; scripted + recorded grant → run; scripted + recorded denial → strip; scripted + no record → render stripped and ask.
- The one-time prompt uses §3.4's wording ("This book has interactive features (audio, and similar). Enable them?"); Enable and Keep-off both persist to the book's metadata record; dismissing without answering re-asks next open. On grant the book re-renders with scripts at the same position.
- Consented books skip script-stripping AND get the §8 `data-src` rewrite: each `span.clip[data-src]` without a URL scheme is resolved against its section and given a reader-created `blob:` URL for the same bytes, so the book's player passes it through untouched. The rewrite runs in the pre-blob markup transform (same hook as stripping), so it is complete before any book script can read `data-src`. A clip href that resolves to nothing in the book — the first real-book failure, caused by invalid chapter-relative hrefs — warns to the console naming the resolved path, degrades that span gracefully, and never breaks the section (fixture-covered). Non-consented books get no rewrite.
- Fixtures (§6): `scripted-clips.epub` implements the §8 contract exactly (clip spans, one static audio element with a generated WAV tone, visible clip styling, `properties="scripted"` on spine itemref and manifest item, the contract player script); `scripted-hostile.epub` attempts a `localStorage` write on load, inline and via an `on*` attribute.
- e2e: (1) default: clip spans render styled, tapping does nothing, the audio element never plays — graceful degradation is asserted, per the publisher contract; (2) after consent: tapping a clip seeks and plays the shared audio element, toggles `clip-playing`, and stops at `data-end` (asserted via the media element's `paused`/`currentTime`); (3) the hostile book's write never lands without consent; (4) consent persists across close/reopen; (5) revocation from the settings trusted-books list returns the book to stripped.
- Settings lists trusted (consented) books and can revoke each. The "trust books from this catalog" auto-consent option is deferred to M6 with catalogs themselves.

## M4 — direction

Accepted when all of the following hold (e2e: `e2e/rtl.spec.ts`; unit: `tests/i18n.test.ts`):

- `rtl-book.epub` fixture (§6): `page-progression-direction="rtl"`, `dir="rtl"` Arabic text, three chapters, nav TOC, cover; deterministic like the rest of the generator.
- Opening the RTL fixture pages right-to-left: "next" moves leftward. The toolbar Previous/Next controls are logical (`prev()`/`next()`), keep their logical labels, and swap their arrow glyphs to match the book's physical direction.
- Keyboard stays physical-to-logical: ArrowLeft is _next_ in an RTL book, ArrowRight _previous_ (foliate `goLeft`/`goRight`); PageDown/PageUp/Space remain logical. Asserted by e2e against the RTL fixture.
- TOC navigation works in the RTL book (labels render, entries navigate).
- UI is RTL-ready: the i18n store carries a reactive locale; switching to an RTL locale sets `dir="rtl"` and `lang` on the document element (unit-tested; English remains the only shipped catalog). App styles use logical properties throughout.
- Visual snapshot: RTL reader first page (column order and text alignment are the point).

## M3 — comfort

Accepted when all of the following hold (e2e: `e2e/settings.spec.ts`; unit: `tests/settings.test.ts`, `tests/theme.test.ts`):

- A reactive, localStorage-backed settings store (`readhtml_settings` key, defined only in `storage/keys.ts`) holds flow, font size, and theme; every read/write is try/catch-wrapped with defaults on failure, and corrupt or out-of-range stored values sanitize to defaults (unit-tested).
- Reading mode: paginated ↔ scrolled via foliate's `flow` attribute, switchable while reading without losing position; persisted and restored across reload.
- Font size: a native range control (70–150%) sets a root `font-size` percentage injected into every book section; publisher styles cascade under it; persisted.
- Theme: auto (default, follows `prefers-color-scheme`) / light / dark, applied to app chrome and book content by constraining `color-scheme` — system colors flip with it; no inversion filters. Manual override persists; book content styling is injected CSS via the renderer's `setStyles`.
- Settings live in a native `<dialog>` reachable from both the reader toolbar and the library; paging keys are inert while it is open, and keys targeted at form controls never page.
- Accessibility: axe passes with the settings dialog open. Visual snapshots: dark-theme reader and scrolled-flow reader.

## M2 — persist

Accepted when all of the following hold (e2e: `e2e/library.spec.ts`; unit: `tests/storage.test.ts`, `tests/metadata.test.ts`):

- Importing an EPUB via the file picker persists it and opens it. Book bytes go to OPFS when available — feature-detected, including `createWritable` support — otherwise to IndexedDB: one `BookStorage` interface, two implementations, both unit-tested (OPFS against an in-memory mock, IDB against fake-indexeddb).
- Book identity is the SHA-256 hex hash of the file bytes. Re-importing the same file creates no duplicate (the existing record's last-opened timestamp updates).
- Per-book metadata lives in a single IndexedDB object store: id, title, author (normalized display strings), cover thumbnail, reading position (EPUB CFI string), fraction (library progress display), scripting-consent flag (consumed at M5), last-opened and added timestamps. Storage keys and DB names are constants in `src/lib/storage/keys.ts`; no other module mentions them.
- Library view (the start screen): each imported book shows cover, title, author, and reading progress percentage, ordered by last opened; activating a book opens it at its saved position; a delete control (native `confirm()`) removes bytes and metadata. With no books, only the file picker shows.
- Reading position: relocate CFIs persist debounced while reading and flush on leaving the reader; reopening a book restores the exact position (e2e round-trips the fraction, including across a page reload).
- The reader toolbar gains a back-to-library control.
- CFI persistence round-trip is unit-tested (the stored string survives put/get verbatim).
- Accessibility: axe passes on the library with books present. Visual snapshot: library view with one imported book.

## Single-file build target (standalone step, post-M2)

Pulled forward from M7 to resolve §1's "two build targets from day one" against §5's original sequencing. Accepted when:

- `npm run build:single` produces a self-contained `dist-single/READ.html` (all assets inlined, the vendored engine's dynamic imports collapsed into the single chunk).
- `npm run smoke` boots both artifacts headlessly and fails loudly if either is missing: `dist/` over HTTP and `READ.html` from a `file://` URL (its offline-from-disk contract). CI builds and smokes both on every push.
- Remaining at M7: the 1.5 MB size-budget CI gate, README, deploy pipeline, and feature 11's full `file://` storage degradation (in-memory + notice) with its e2e.

## M1 — render

Accepted when all of the following hold (e2e: `e2e/reader.spec.ts`, `e2e/visual.spec.ts`; unit: `tests/strip.test.ts`):

- The start screen offers a native file picker (`<input type="file">`, `.epub`); picking `fixtures/build/basic-ltr.epub` opens the book in the reader view.
- The book renders paginated (foliate paginator, default flow); the first page of chapter one is visible after open.
- Next/previous work from toolbar buttons and keyboard (ArrowRight/ArrowLeft via foliate's direction-aware `goRight`/`goLeft`, plus PageDown/PageUp/Space); advancing moves the reading position forward, going back returns.
- A TOC control opens a native `<dialog>` drawer listing the book's TOC; activating an entry navigates to that chapter and closes the drawer.
- **Default scripting posture lands with first render (§3.4)**: every (X)HTML resource is script-stripped (`<script>` elements and `on*` attributes removed) via the Loader `data` hook before its blob URL is created. The consent flow that can lift this arrives at M5; until then stripping is unconditional. Unit-tested at the DOM level; e2e asserts a stripped book still renders.
- UI strings go through the i18n `t()` function (gettext-style: English source text as key); no hardcoded strings in markup.
- Accessibility: axe-core assertions pass on the start screen and reader view (run inside the Playwright suite).
- First visual snapshot: the reader showing chapter one, first page, committed as a Linux baseline generated via `npm run test:e2e:update` (Docker). Visual specs run only on Linux (CI and the Docker runners) — macOS font rendering differs by design.
- Fixtures: `fixtures/generate.mjs` (deterministic, zero-dep, STORED zip with `mimetype` first) builds `basic-ltr.epub` per §6; generated by npm `prepare`, gitignored.

## M0 — scaffold

Accepted when all of the following hold:

- `npm run validate` passes: svelte-check (`--fail-on-warnings`) + `tsc` for node-side scripts/configs, ESLint (`--max-warnings 0`), Prettier check, knip dead-code check, vitest unit tests, and `vendor-check`.
- The empty app shell renders: document title is `READ.html`, a `<main>` region fills the viewport, app chrome uses system fonts and system colors with `prefers-color-scheme` respected.
- Placeholder e2e (`e2e/shell.spec.ts`) passes on Chromium and WebKit; Firefox runs as a best-effort, non-blocking CI job.
- `vendor-check` (part of `validate`) verifies the two foliate-js integration points READ.html depends on: the section-iframe `sandbox` attribute in `paginator.js` and the `data` CustomEvent dispatch in `epub.js`'s `Loader.createURL`. Unit tests cover both the intact and the changed-upstream case.
- foliate-js is vendored at a pinned commit with `LICENSE` and `VENDORED.md` (commit hash, patch list, update procedure); only the EPUB path is vendored, excluded formats cannot appear in the bundle (their format branches are patched out of `view.js`).
- `npm run build` produces the hosted `dist/`, and `npm run smoke` boots it headlessly and asserts the shell renders.
- CI (`.woodpecker.yml`) runs validate, build + smoke, and the Playwright suite on every push.
