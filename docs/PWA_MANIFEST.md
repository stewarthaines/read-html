# Host-provided web app manifest

A published interface of the single-file build, like [PAYLOAD_SLOT.md](./PAYLOAD_SLOT.md): hosting sites depend on the guarantee below, so changes to it are breaking changes.

This document is the spec; per the working agreement, implementation lands as failing tests first (build assertions in both targets), then code.

## The problem it solves

READ.html should be installable as an app (PWA) where it is hosted — but the same single file is also served inside another site's scope (SEED.html's origin serves it at `/READ.html`, alongside the editor's own root-scope PWA), double-clicked from disk, and shipped as book-carrying payload copies. One hardcoded manifest cannot fit all four lives. So the file declares _where_ a manifest would be, and each host decides _what_ it says — or provides none.

## Contract

The built `READ.html` (both targets) carries exactly one manifest link in `<head>`:

```html
<link rel="manifest" href="READ.webmanifest" />
```

- The href is **relative**, so it resolves against wherever the file is served: `/READ.html` → `/READ.webmanifest`; a subdomain root → `/READ.webmanifest` on that origin.
- **The reader repo ships no manifest file.** The hosting site provides `READ.webmanifest` with whatever `start_url`/`scope`/icons suit its origin — or provides nothing, in which case the dangling link is a silent no-op (this is the normal state for `file://` double-clicks and book-carrying payload copies; verify no user-visible error in that state).
- The link must not interfere with the payload slot or any existing head content, and it survives both builds byte-for-byte (asserted alongside the existing `payload-check`).
- App behavior must not depend on being installed; the manifest adds installability, nothing else.

## What hosts will do with it (informative, not this repo's code)

- **SEED.html's origin** serves a manifest scoped to the reader's own page — `"start_url": "/READ.html"`, `"scope": "/READ.html"`, `"display": "standalone"`, name `READ.html` — nested inside the editor's root-scope PWA (Chromium supports nested scopes; `?book=`/`?catalog=` links stay in scope). Icons as `data:` URIs keep it a single extra file.
- **A future dedicated origin** (e.g. read.readitinabook.com) serves a root-scope manifest and can add its own service worker for offline; out of scope here.

## Notes

- An installable manifest requires icons; per the no-branding rule (§3.8 of the bootstrap), the icon is a functional necessity, not a mark — hosts should keep it maximally plain (e.g. a monochrome open-book line glyph). This repo ships no icon.
- iOS ignores manifest scope and installs per-page from Safari's share sheet; that already works and needs nothing here. Do not add an `apple-touch-icon` link — it would dangle in every `file://` copy for marginal benefit.
- This changes the shipped file: version bump per the changelog-decides rule, and release-note the new interface.
