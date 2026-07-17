# READ.html

**READ.html** is a focused, in-browser EPUB reader. Its mission: the simplest way to present an EPUB to a reader who doesn't know what EPUB is and couldn't open an `.epub` file if they had one. They click a link, the book opens, they read.

## Reading

READ.html is distributed as part of the [SEED.html](https://readitinabook.com) tool rather than on its own domain: the built app is served at `readitinabook.com/read/READ.html`.

- **Hosted**: open the reader at its served URL, then open a book with the file picker or drag one onto the page. Your library, positions, and settings stay in your browser — there are no accounts and no server storage.
- **Single file**: the same `READ.html` also works opened from disk. Everything works offline except fetching books and catalogs by URL. **Opened from disk (`file://`), it renders books in Firefox and Safari but not Chrome/Chromium** — Chromium blocks the `blob:` resources the engine uses inside a `file:`-origin page. Served over http(s) it works in every browser, so host the file if you need Chrome-from-a-link.
- **Link to a book**: `<served-url>?book=<url-of-epub>` opens an EPUB directly.
- **Link to a catalog**: `<served-url>?catalog=<url-of-opds-feed>` opens the catalog browser.

## Catalogs and CORS — read this if you publish

READ.html fetches catalogs and books directly from your host — **there is no proxy**. Your catalog host must therefore be CORS-readable from the reader's origin:

- Send `Access-Control-Allow-Origin: *` (a public catalog carries no credentials, so `*` is safe) on the **catalog feed, the EPUB files, and cover images** — all three are fetched.
- Feeds may be OPDS 1.x (Atom) or OPDS 2.0 (JSON). Acquisition hrefs are used exactly as given and resolved against the feed URL — the reader never re-encodes them, so `%20` stays `%20`.
- If a fetch fails cross-origin, the reader tells the reader-person that CORS is the likely cause. It is the publisher's job to fix; this is by design.

## Interactive books

Books can declare scripted content (`properties="scripted"`). Scripts are **stripped by default** — a scripted book must degrade to fully readable text without them (that is the publisher contract in `docs/CONTENT_CONVENTIONS.md`). On first open the reader is asked once whether to enable a book's interactive features; the answer is per book, revocable in settings, and a saved catalog can be marked trusted to skip the question for its books. Consented scripts run with the reading origin's authority — the threat model is stated in `docs/SPEC.md`.

## Storage caveats

- Books live in your browser's storage (OPFS where available, IndexedDB otherwise). **Safari deletes all of it after seven days without a visit** — treat the library as re-importable, not archival. Re-importing the same file restores its identity.
- Where no storage works at all (`file://` in some browsers, some private modes), the reader says so and still reads; the library lasts until the page closes. Verified: Chromium keeps IndexedDB under `file://`; engines that refuse it degrade to the in-memory library.

## Development

```sh
npm install          # also generates test fixtures (fixtures/build/)
npm run dev          # owner-run dev server
npm run validate     # typecheck + lint + format + dead-code + unit tests + vendor-check
npm run test:e2e     # Playwright (Chromium primary, WebKit first-class, Firefox best-effort)
npm run build        # hosted app -> dist/
npm run build:single # self-contained READ.html -> dist-single/ (1.5 MB budget, CI-gated)
npm run smoke        # boots both built artifacts headlessly
npm run test:e2e:update  # regenerates visual baselines in the CI Docker image
```

The rendering engine is [foliate-js](https://github.com/johnfactotum/foliate-js) (MIT), vendored at a pinned commit in `vendor/foliate-js/` — see `VENDORED.md` there for the pin, local patches, and update procedure. The founding spec is `docs/BOOTSTRAP.md`; living acceptance criteria are in `docs/SPEC.md`.

CI (`.woodpecker.yml`) builds and validates only; it does not deploy. READ.html ships as part of the SEED.html deployment at `readitinabook.com/read/`, so that tool's pipeline is responsible for publishing the built artifact.

## Non-goals

- Not a library manager, annotation platform, or sync service. No accounts, no server, no telemetry.
- No highlights, bookmarks, dictionaries, TTS, or in-book search in v1 — foliate-js offers modules for all of these; deliberately unused.
- No formats beyond EPUB (foliate-js's mobi/fb2/cbz parsers are excluded from the bundle).
- Not an editor. It opens finished books.

## License

MIT — see [LICENSE](LICENSE).
