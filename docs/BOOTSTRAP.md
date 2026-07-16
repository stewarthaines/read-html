# READ.html — project bootstrap plan

This document is self-contained. It is the only context the implementing agent receives: every product decision, technical constraint, and content convention needed to scaffold and build the project is stated here. Do not assume access to any other codebase.

## 0. How to run this plan

- Work **one milestone (§5) per instruction**. Do not begin the next milestone without the owner's go-ahead; each milestone ends with validation green, a commit, and the owner eyeballing the result.
- Commit this document into the repo at M0 as `docs/BOOTSTRAP.md` — it is the founding spec that `CLAUDE.md` (§9) and `docs/SPEC.md` are extracted from. Re-read it at the start of each milestone.
- Owner-provided environment (confirm before M0, ask if absent): Node toolchain installed; the Codeberg `read-html` repo created and set as `origin`; Cloudflare Pages project and deploy credentials are owner actions (§11) and do not block M0–M6 work.
- Playwright visual-snapshot baselines are committed to the repo (they are what CI compares against), but their pixels must be **generated inside the CI-matching environment** — font rendering differs across platforms, so a baseline captured natively on macOS fails forever on Linux CI. Provide `npm run test:e2e:update`, which runs `--update-snapshots` inside Playwright's official Docker image (same version as CI); the developer reviews the resulting PNGs and commits them. A new or intentionally changed snapshot is part of its feature's definition of done: missing baseline = red test. Establish this in M1 with the first snapshot.
- Synthetic fixtures (§6) prove features; they do not prove the product. From M1 onward, each milestone's owner review includes opening a real published EPUB supplied by the owner. Real-book problems become fixtures or SPEC.md items before the next milestone.

## 1. Product definition

**READ.html** is a focused, in-browser EPUB reader. Its mission: the simplest way to present an EPUB to a reader who doesn't know what EPUB is and couldn't open an `.epub` file if they had one. They click a link, the book opens, they read.

- **Name**: READ.html. The distributable single file is `READ.html`. Functional identifiers use the `readhtml` prefix (`readhtml_*` localStorage keys, `readhtml-storage` IndexedDB database).
- **Hosting**: `read.readitinabook.com`, deployed as a static site to the Cloudflare Pages project `read-html` by Woodpecker-style Codeberg CI on push to `main` (the owner wires the deploy credentials). `main` deploys — feature work happens on branches, merged when shippable.
- **Distribution**: two build targets from day one. (1) The hosted web app. (2) A single self-contained `READ.html` file (all assets inlined) that works offline from disk.
- **License**: MIT. Repository is `read-html`, private on Codeberg (origin) with a public GitHub mirror; reader-facing links point at the mirror.
- **Rendering engine**: [foliate-js](https://github.com/johnfactotum/foliate-js) (MIT), EPUB modules only.

### Non-goals (write these into the README)

- Not a library manager, annotation platform, or sync service. No accounts, no server, no telemetry.
- No highlights, bookmarks, dictionaries, TTS, or in-book search in v1 — foliate-js offers modules for all of these; deliberately unused.
- No formats beyond EPUB (foliate-js's mobi/fb2/cbz parsers are excluded from the bundle).
- Not an editor. It opens finished books.

## 2. Foundation decisions

- **Framework**: Svelte 5, **runes mode exclusively** (`$state`, `$props`, `$derived`, `$effect`, callback props, snippets, `onclick`-style event attributes). No legacy Svelte syntax (`export let`, `$:`, `createEventDispatcher`, `<slot>`, `on:` directives) anywhere, ever.
- **Language**: TypeScript everywhere. Zero TypeScript errors at all times is a hard project rule.
- **Build**: Vite (current major). The single-file target uses `vite-plugin-singlefile` (or equivalent inlining) as a second build config.
- **Lint/format**: ESLint + Prettier, `--max-warnings 0` from the first commit. Never raise the cap.
- **Tests**: vitest for unit tests, Playwright (installed in-repo) for e2e. See §7.
- **Validation command**: `npm run validate` = typecheck + lint + format check + dead-code check (`knip` — gated from M0 while the baseline is zero) + unit tests + `vendor-check` (§7). Typecheck means `svelte-check --fail-on-warnings` for components **plus** `tsc` for node-side scripts and configs — bare `tsc` never sees inside `.svelte` files. CI runs `validate` **and** the Playwright suite on every push. Do not merge red.
- **Build verification scripts**: `npm run smoke` boots each built artifact (the hosted `dist/` and the single-file `READ.html`) headlessly and asserts the shell renders — build-config breakage is invisible to unit tests and dev-server e2e, so CI runs `smoke` after every build. `npm run analyze` opens a bundle-size visualizer; it is the working tool for the M7 size budget.
- **foliate-js integration**: vendor the source into `vendor/foliate-js/` — pin whatever upstream `main` commit is current when you vendor, and record that hash in a `VENDORED.md` alongside the LICENSE file, with the update procedure ("update = new commit hash + full test suite green"). Rationale: foliate-js's README states the API is unstable and may break at any time; there is no versioned release channel to pin. Import only the EPUB path: `epub.js`, `epubcfi.js`, `paginator.js`, `progress.js`, `overlayer.js` (dependency of the view), `view.js`, `search.js` (vendored for a later release, **not imported** — search is not in v1), `opds.js`, and the vendored `zip.js` dependency. Exclude `mobi.js`, `fb2.js`, `comic-book.js`, `pdf.js`, `tts.js`, `dict.js` from the bundle and verify by inspecting build output size.

## 3. Architecture

### 3.1 Directory layout

```
read-html/
  vendor/foliate-js/        # pinned engine + LICENSE + VENDORED.md
  src/
    lib/
      reader/               # foliate <foliate-view> integration, section hooks
      storage/              # book bytes + metadata persistence (see 3.2)
      settings/             # reactive settings store, localStorage-backed
      catalog/              # OPDS fetching/parsing (wraps vendor opds.js)
      scripting/            # consent-gated scripting (see 3.4)
      i18n/                 # minimal reactive i18n with RTL (see 3.6)
      theme/                # app tokens + book-content CSS injection
    App.svelte              # single-page app; view switching via $state, no router/SvelteKit
  fixtures/                 # generated test EPUBs + generator script (see §6)
  e2e/                      # Playwright specs
  docs/SPEC.md              # living feature spec (acceptance criteria)
  docs/CONTENT_CONVENTIONS.md  # copied verbatim from §8 of this plan
```

### 3.2 Storage

foliate-js has **no persistence** — it renders from a `File`/`Blob`, a URL, or a custom loader. The app owns all storage:

- **Book bytes**: OPFS (Origin Private File System) when available, IndexedDB fallback otherwise. Feature-detect (including `createWritable` support); one `BookStorage` interface, two implementations. OPFS matters beyond durability: its `File` objects give foliate's zip.js random-access reads, so large books open without loading fully into memory.
- **Per-book metadata** (reading position as EPUB CFI string, title/author/cover-thumb for the library view, scripting-consent flag, last-opened timestamp): a single IndexedDB object store keyed by a content hash of the book file (hash the bytes on import; this also dedupes re-imports).
- **App state** (settings, last-open book id, saved catalog URLs): localStorage under `readhtml_*` keys, each read/write wrapped in try/catch with defaults on failure.
- Storage keys and DB names are constants in one module. No other file mentions them.

### 3.3 Reader integration

- Plain Vite + Svelte, **no SvelteKit**: the app is a single page with view switching in state (library / reader / settings / catalog), and the single-file build target strongly favors the simpler pipeline. Deep-link params (§3.7) are read once at startup.
- Wrap foliate's `<foliate-view>` custom element in a Svelte component. The view element is the DOM boundary: Svelte owns everything outside it (toolbars, drawers, settings), foliate owns section rendering inside it.
- Listen to the view's per-section load events to get each section's `Document` (foliate iframes are same-origin, so the app can reach in). This hook is where §3.4's per-section work happens.
- Reading position: capture CFI on relocate events, persist debounced; restore on open.
- Navigation must be **logical, not physical**: "next page" advances in reading order. foliate respects the book's `page-progression-direction`, so in an RTL book, next moves leftward. Keyboard: arrow keys map to logical prev/next based on book direction; also PageUp/PageDown/Space.

### 3.4 Scripted content — consent-gated (a core feature, not an afterthought)

Background facts about foliate-js (verified against source, commit as of 2026-07; re-verify when vendoring):

- `paginator.js` creates section iframes with `sandbox="allow-same-origin allow-scripts"` — scripting is **enabled** at the iframe level. `allow-same-origin` is required for pagination/CFI, and together with `allow-scripts` it neutralizes sandbox isolation. There is no way to isolate book scripts without forking the paginator (opaque-origin iframes are unreachable to it). Do not attempt.
- `epub.js` rewrites **every `[src]` attribute** in section documents to `blob:` URLs backed by bytes from the EPUB — including `<script src>`, which therefore loads and runs. Inline `<script>` passes through untouched. `data-*` attributes are **not** rewritten.
- Blob documents inherit the embedding page's CSP. foliate's README instructs embedders to block book scripts with a page-level CSP; READ.html deliberately does not ship such a CSP, and gates scripting itself:

**Mechanism**:

1. Detect scripted books before rendering: spine items carrying `properties="scripted"` in the OPF (foliate exposes spine/manifest data after parsing).
2. Default posture: scripts stripped. foliate's resource loader dispatches a `data` CustomEvent from `Loader.createURL` for every resource, with a replaceable `detail.data` — hook it and, for non-consented books, remove `<script>` elements (and `on*` attributes) from (X)HTML resources before the blob is created. Verify the hook still exists when vendoring; if it has changed, patch the vendored loader minimally and record the patch in `VENDORED.md`.
3. When a scripted book is opened without recorded consent, show a one-time prompt: "This book has interactive features (audio, and similar). Enable them?" Persist the answer in the book's metadata record. Re-render with scripts on consent.
4. Settings screen lists trusted books and can revoke; an optional "trust books from this catalog" setting auto-consents books acquired through a saved catalog (publisher-allowlist model).
5. A scripted book without consent must degrade gracefully — that is the publisher's contract (see §8), and a fixture tests it.

**Threat model to state in SPEC.md**: consented book scripts run with the app origin's authority (OPFS library, localStorage). This is accepted by design for a trusted-publisher reader on a dedicated origin holding nothing but reading data. This is exactly why READ.html lives on its own subdomain.

### 3.5 Theming and typography

- App chrome: CSS custom-property design tokens, light and dark themes, `prefers-color-scheme` default with a manual override persisted in settings.
- Book content: inject a user-settings stylesheet into each section (foliate supports style injection into section documents). Font size is the v1 control (a root `font-size` percentage; publisher styles cascade under it). Dark mode for book content overrides colors via injected CSS custom properties — do **not** use inversion filters (they destroy images).

### 3.6 i18n

- Minimal reactive translation store: `$t('key')` usage in components, dictionary per locale, instant switching, `dir="rtl"` set on the document for RTL locales, logical CSS properties (`margin-inline-start`, not `margin-left`) throughout.
- Ship English only at launch, but structure strings as extractable message catalogs (gettext-po-compatible keys) so real translations can be added without refactoring. Do not build the extraction pipeline in v1; just don't hardcode strings in markup.

### 3.7 OPDS and deep links

- `catalog/` wraps vendored `opds.js` (parses OPDS 1.x → 2.0). UI: add a catalog by URL, browse entries, download to library, cover thumbnails from the feed's image links.
- **No proxy.** Catalogs must be CORS-readable from the reader's origin. Document this requirement prominently (README + a friendly in-app error naming CORS when a fetch fails). The publisher controls CORS headers on their own catalog hosts.
- Deep links: `?book=<url>` fetches and opens an EPUB directly (CORS applies); `?catalog=<url>` opens the catalog browser pre-loaded. These make READ.html linkable from anywhere a book is published.
- URL-encoding correctness is a first-class requirement: hrefs from feeds are used exactly as given, resolved against the feed URL with `new URL(href, base)`; never re-encode an already-encoded URL. (A known commercial web reader double-encodes `%20` and 404s; there is an e2e fixture for this in §6.)

### 3.8 Visual design — no look of its own

The design reference is the **PDF.js viewer built into Firefox**: chrome so plain and familiar that readers assume the browser itself is doing the work. READ.html should feel like a capability the browser always had, not a website someone built. Concretely:

- **The book is the interface.** Chrome recedes: one slim toolbar, drawers/panels that get out of the way, maximum area for the page. No hero sections, cards, gradients, decorative shadows, or animation beyond what aids orientation (e.g. a drawer sliding).
- **System everything.** `system-ui` font stack for all chrome; system colors where CSS system color keywords serve (`Canvas`, `CanvasText`, `AccentColor` with fallbacks); monochrome line icons at one weight; native scrollbars.
- **Native controls, unstyled beyond layout.** `<select>`, `<input type="range">`, `<button>`, `<dialog>` as the browser draws them — this buys the built-in look and platform accessibility in one move. Do not build custom dropdowns, sliders, or modal frameworks.
- **Both themes are just light-and-dark of neutral** — grays, with the accent being **browser-default blue**: unstyled link color and `AccentColor`/`accent-color` where the platform provides them, `LinkText` as the CSS system-color fallback. No brand hex anywhere. `prefers-color-scheme` decides the theme by default.
- **No branding, anywhere.** No wordmark, no logo, no footer credit, no publisher cross-links. The name "READ.html" appears in the document title and in the about panel, whose entire content is: the name, one plain sentence ("A reader for EPUB books that works in your browser."), the MIT license, and a link to the source repository. Nothing else — no mascot, no mark, no house style.
- Acceptance heuristic for any UI change: screenshot it next to Firefox's PDF viewer — if READ.html looks more "designed," simplify.

## 4. v1 feature list (each maps to acceptance criteria in docs/SPEC.md and to e2e specs)

1. Open an EPUB by file picker, drag-drop, or `?book=` URL; book persists to the library.
2. Library view: covers, titles, reading progress; open/delete.
3. Paginated and scrolled reading modes (foliate `flow` attribute), toggle persisted.
4. Font size control, persisted.
5. Light/dark theme for app and book content, persisted, `prefers-color-scheme` default.
6. Reading position persists per book; reopening restores it.
7. TOC drawer; progress slider (foliate `progress.js`).
8. RTL books page right-to-left; logical navigation everywhere. UI is RTL-ready (logical properties, `dir` switching).
9. Scripted-content consent flow per §3.4.
10. OPDS: add catalog, browse, download to library.
11. Single-file `READ.html` build: everything works offline from a `file://` open, except URL/catalog fetching (needs network) — storage behavior under `file://` must be feature-detected and degrade to in-memory + a notice if unavailable (verify per browser in e2e where possible; document what was verified manually).
12. Keyboard accessible throughout; visible focus; page navigation announced politely to screen readers.

## 5. Milestones (each ends green: validate + e2e; commit per milestone minimum)

- **M0 scaffold**: repo, toolchain, CI, vendored foliate-js, CLAUDE.md written from §9, empty app shell renders, one placeholder e2e passes. CI runs validate + Playwright from this milestone on.
- **M1 render**: open fixture book from file picker, paginated reading, next/prev, TOC. First visual snapshots.
- **M2 persist**: storage layer (OPFS + IDB fallback, unit-tested), library view, position restore.
- **M3 comfort**: scroll mode, font size, themes.
- **M4 direction**: RTL fixture paging correctly, logical nav, UI dir switching.
- **M5 scripts**: consent gate end-to-end against scripted fixtures (§6), including the strip path and the graceful-degradation assertion.
- **M6 catalog**: OPDS browse/download, deep links, CORS error UX.
- **M7 ship**: single-file build target, size budget check (fail CI if `READ.html` exceeds 1.5 MB), README, deploy pipeline.

## 6. Test fixtures

`fixtures/generate.mjs` (node, no heavyweight deps — a minimal ZIP writer is acceptable; EPUB requires the `mimetype` entry first and STORED/uncompressed) builds fixture EPUBs into `fixtures/build/`. Deterministic means byte-identical across runs: fixed ZIP timestamps, no randomness. Covers are generated SVG (text on flat color — no image libraries or canvas). TOC is EPUB 3 `nav.xhtml` (no NCX). Audio is a programmatically generated WAV sine tone, a few seconds long (no MP3 encoder dependency; §8's CBR guidance is for the publisher's real books, not fixtures). The fixtures:

- `basic-ltr.epub` — 3 chapters, TOC, cover, author/title metadata.
- `rtl-book.epub` — `page-progression-direction="rtl"`, `dir="rtl"` Arabic or Hebrew sample text.
- `fixed-layout.epub` — minimal FXL (render without crashing is the only v1 claim).
- `no-metadata.epub` — missing author/cover/title fallbacks.
- `scripted-clips.epub` — implements §8 exactly: clip spans, static audio element carrying the generated tone, a stylesheet that visibly styles `span.clip` (so the degraded state is assertable), `properties="scripted"`, and a small book script written for this fixture that fulfils the §8 contract — click on a clip span seeks the shared audio element to `data-begin`, plays until `data-end`, toggles `clip-playing` on the active span, and resolves `data-src` per §8's scheme-pass-through rule. Two e2e cases: (1) default — scripts stripped, clip spans render styled but tapping does nothing; (2) after consent — the book re-renders with scripts, tapping plays (assert via the media element's `paused`/`currentTime` state).
- `scripted-hostile.epub` — script attempts `localStorage` write on load. Asserts the strip path really strips (no write without consent).
- `spaces in name.epub` — filename and internal hrefs with spaces, plus one OPDS 1.x (Atom) feed fixture (`fixtures/build/catalog.xml`) whose acquisition hrefs contain `%20` and point at the real generated fixture files, served together by the e2e static server — the e2e downloads a book through the catalog end-to-end, guarding URL-encoding correctness (§3.7).

Fixtures are generated by npm's `prepare` lifecycle hook (runs automatically after `npm install`, locally and in CI) and are gitignored, never committed as binaries.

## 7. Test strategy

- **TDD from spec**: every feature lands as (1) acceptance criteria in `docs/SPEC.md`, (2) failing e2e or unit test, (3) implementation to green. For agent-driven development this is the contract: no feature code before its failing test exists.
- **Unit (vitest)**: storage interface + both backends (mock OPFS where needed), settings store, CFI persistence round-trip, catalog parsing, consent state machine, script-stripping transform (DOM-level, no iframe needed).
- **E2E (Playwright)**: the reading experience itself — pagination is CSS columns inside an iframe; only e2e sees the truth. Serve `fixtures/build/` statically. Use **visual snapshots** for pagination geometry, themes, and RTL layout. Browser matrix, all three wired up at M0: Chromium (primary), **WebKit (first-class — the audience reads in Safari-family engines)**, Firefox (best-effort: a non-blocking CI job).
- **Accessibility assertions run inside the Playwright suite** (axe-core via `@axe-core/playwright`) on the library, reader, and settings views — not as a separate tool. Violations fail e2e like any other assertion.
- **Engine-upgrade harness**: the whole suite is the safety net for bumping the vendored foliate-js commit. A `vendor-check` script (part of `npm run validate`) diffs the two integration points that the app depends on (the iframe `sandbox` attribute in `paginator.js`; the `data` event dispatch in `epub.js`'s Loader) and fails loudly if they changed.

## 8. Content conventions (interoperability contract — copy verbatim into docs/CONTENT_CONVENTIONS.md)

READ.html's primary content is books produced by a publisher whose EPUBs follow these conventions. The reader supports them as a _content contract_, not by importing any publisher code.

- **Audio clips**: text spans marked `<span class="clip" data-src="…" data-begin="…" data-end="…">label</span>`, optionally `data-rate`. `data-src` is an OPF-relative href to an audio file in the book; `data-begin`/`data-end` are `h:mm:ss.dd` or plain seconds. The chapter carries **one static `<audio>` element** (the book's own script plays every clip through it) and links its own player script; chapters declare `properties="scripted"` in the OPF spine.
- The book's player resolves `data-src` relative to the chapter (`../` + href) **except when the value already carries a URL scheme, which passes through untouched**. Because foliate rewrites only `src` attributes (not `data-*`), READ.html must rewrite each `span.clip[data-src]` to the corresponding resource `blob:` URL in its section-load hook (consented books only). The full sequence in READ.html is therefore: foliate rewrites the `<audio src>` and `<script src>` to `blob:` URLs → the reader's hook rewrites each `data-src` to the matching `blob:` URL → the book's player sees a scheme on `data-src` and passes it through unchanged. In an environment that rewrites nothing, the same player resolves the relative href instead. One player, both worlds.
- The book's script toggles a `clip-playing` class on the active span and publishes a `--clip-duration` CSS custom property; the book's own stylesheet animates progress indicators from these. The reader needs no knowledge of this beyond not interfering.
- **Graceful degradation is guaranteed by the publisher**: without scripts, clips render as styled text and the book is fully readable. The reader's default (scripts stripped) is therefore always safe.
- Books may embed their editor as `SEED.html` plus a `SEED.zip` source archive at the EPUB root. The reader ignores both; they are opaque payload.

## 9. Agent working agreement (write into the new repo's CLAUDE.md at M0, verbatim)

- First thing in a session, ask the owner whether the session is primarily **DOCUMENTATION**, **TESTING**, or **DEVELOPMENT** based.
- The owner expects **zero TypeScript errors in the codebase at all times**. Fix type errors immediately; never defer or suppress them. ESLint runs with `--max-warnings 0`; never raise a warnings cap.
- **Do not invent features.** Implement only what is specified or requested. When writing API docs, document only the methods asked for — never speculative capabilities.
- **No fallback-style code** (auto-creating missing files, silently substituting default content) unless the owner explicitly approves it. Fail loudly instead.
- When work is under-specified, ask the owner for clarification — **one question at a time**, not a list. For open design questions, discuss in prose with a recommendation, not multiple-choice menus.
- The owner runs the dev server; the agent never needs to start it.
- The owner is the system-architecture expert. When orientation is needed, ask them before sweeping the codebase.
- Commit hygiene: one concern per commit; stage named files, never `git add -A`.
- Changelog entries describe **what the user experiences**, one short line per change. Mechanisms and implementation detail belong in commit messages.
- Markdown documents use one line per paragraph — no hard-wrapping.

### Delegation and model tiering

Frontier-model attention is the project's scarcest resource; spend it on judgment, not typing. The TDD discipline in §7 exists partly to make delegation safe: a task is **delegable to a cheaper/faster sub-agent when its done-condition is mechanical** — a named failing test to turn green, a written spec to transcribe, a checkable output format.

- **Delegate down** (tightly specified, verified by `npm run validate` + named tests): implementing a module to an already-written interface and failing test suite; fixture-generator work to §6's spec; test skeletons transcribed from written acceptance criteria; config/boilerplate; mechanical refactors (renames, import moves); i18n string extraction.
- **Never delegate down**: anything in §3.4 (scripting/consent/security), foliate-js integration points and vendored-code patches, spec and acceptance-criteria authoring, storage-schema decisions, dependency choices, and any task whose instructions contain the word "probably."
- The lead agent reviews every delegated diff before it is committed, and the sub-agent must run validation itself and report results — an unverified "done" is not done.
- Write delegated task prompts as if for a competent contractor with no project context: name the files, the interface, the test command, and the definition of done. If the prompt is hard to write that precisely, the task is not delegable — do it in the lead context.

## 10. Explicitly not imported

This project shares an operator and a domain with an EPUB _editor_ project, but no code, no configs, and no naming. Do not copy that project's storage layer, i18n pipeline, or design system; their requirements are heavier than this reader needs. The only inherited artifacts are this plan and §8's content contract. Where this plan is silent, prefer the smallest thing that satisfies the spec.

## 11. Open items for the owner

All product questions in this plan are resolved. One owner action remains: at M0, wire the Cloudflare Pages deploy credentials into the Codeberg CI pipeline.
