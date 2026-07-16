# READ.html — feature spec

Living acceptance criteria, extracted from and subordinate to `docs/BOOTSTRAP.md` (the founding spec). Every feature lands as: (1) acceptance criteria here, (2) a failing e2e or unit test, (3) implementation to green.

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
