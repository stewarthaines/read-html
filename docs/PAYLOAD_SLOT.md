# Embedded-payload slot

A published interface of the single-file build, like the content conventions in [CONTENT_CONVENTIONS.md](./CONTENT_CONVENTIONS.md): external publishing tools depend on the guarantees below, so changes to them are breaking changes.

This document is the spec; per the working agreement, implementation lands as failing tests first (build assertions + e2e against an injected fixture), then code.

## The slot

The built single-file `READ.html` contains exactly one empty payload element:

```html
<script type="application/epub+zip;base64" id="readhtml-payload"></script>
```

## Contract

- **Publishing tools** may produce a book-carrying copy of READ.html by inserting the base64-encoded bytes of one EPUB as the element's text content, changing nothing else in the file. (Base64 cannot form `</script>` or any HTML-significant sequence, so plain text substitution is safe.)
- **At boot**, if the slot is non-empty, the reader decodes it and opens that book directly — no library view, no import step. If decoding or parsing fails, show the standard unreadable-book error, not a blank page.
- **Browser reach**: a payload copy opened from disk (`file://`) works in every major browser, including Chrome — the engine delivers sections via `srcdoc` so nothing depends on navigating an iframe to a `blob:` URL (see `vendor/foliate-js/VENDORED.md` #6). A double-clicked `BOOK.html` opens offline anywhere.
- **Trust**: the embedded book is trusted by construction — its scripts run without a consent prompt. Payload and reader arrived in the same file; gating one against the other protects nothing. That trust is **per-session and never recorded**: it must not write a consent grant to the shared per-book metadata, where it could override a denial the reader-person recorded against a normally-imported copy of the same book.
- **Precedence**: a non-empty payload wins over `?book=` and `?catalog=` query parameters.
- **Reading position** for an embedded book is persisted best-effort under the book's content hash in a **dedicated `readhtml_*` localStorage key, not the library's metadata store** — the library must gain no record (a bytes-less record would surface as a ghost book that errors on open), and a self-contained payload file must not quietly copy megabytes into origin storage. Silently absent where storage denies it.

## Build guarantees (asserted by tests)

- The slot marker survives the production build byte-for-byte and appears **exactly once** in both build targets.
- The file carries a readable version string as `<meta name="readhtml-version" content="…">`, fed from `package.json` at build time, so vendoring tools can record what they ship.
- Any change to this contract bumps that version and is release-noted.
- The 1.5 MB size budget applies to the **empty-slot** artifact this repo ships; a book-carrying copy grows by its payload, which is the publisher's business.

## Reference consumer

SEED.html (the EPUB editor at the sibling `editme-svelte` repo) vendors `READ.html` and implements a "Package as READ.html" export against this contract — see its `process/READ_HTML_INTEGRATION.md`. Nothing in this repo depends on that consumer.
