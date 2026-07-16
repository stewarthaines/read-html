# Vendored foliate-js

- **Upstream**: https://github.com/johnfactotum/foliate-js (MIT, see `LICENSE`)
- **Pinned commit**: `78914aef4466eb960965702401634c2cb348e9b1` (upstream `main`, 2026-05-01)
- **Why vendored**: upstream's README states the API is unstable and may break at any time; there is no versioned release channel to pin. We pin a commit by copying the source.

## Update procedure

Update = new commit hash + full test suite green. Concretely:

1. Clone upstream, note the new commit hash.
2. Re-copy the vendored files listed below; re-apply the patches listed below.
3. Update the pinned commit hash above.
4. Run `npm run validate` (includes `vendor-check`, which diffs the two integration points READ.html depends on: the iframe `sandbox` attribute in `paginator.js` and the `data` CustomEvent dispatch in `epub.js`'s Loader `createURL`) and the full Playwright suite. If `vendor-check` fails, the integration points changed upstream — re-verify §3.4 of `docs/BOOTSTRAP.md` before proceeding.

## Vendored files (EPUB path only)

`epub.js`, `epubcfi.js`, `paginator.js`, `progress.js`, `overlayer.js`, `view.js`, `opds.js`, `vendor/zip.js` — plus transitive dependencies required by these: `text-walker.js` and `fixed-layout.js` (statically/dynamically imported by `view.js`) and `uri-template.js` (dynamically imported by `opds.js`).

`search.js` is vendored for a later release but **not imported** — in-book search is not in v1.

Deliberately excluded from vendoring and the bundle: `mobi.js`, `fb2.js`, `comic-book.js`, `pdf.js`, `tts.js`, `dict.js`, `vendor/fflate.js`, `vendor/pdfjs/`.

## Local patches

All patches are in `view.js`, marked with `READ.html patch:` comments:

1. **`makeBook` format branches removed** — the CBZ, FB2/FBZ, PDF, and MOBI detection branches (and their dynamic imports) are deleted; any ZIP file is treated as EPUB. This is what keeps the excluded modules out of the Vite bundle, since Vite resolves dynamic import specifiers at build time.
2. **`initTTS()` method removed** — it dynamically imported the excluded `tts.js`.

No other vendored file is modified.
