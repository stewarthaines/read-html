# The served book

A host-provided interface, like [PWA_MANIFEST.md](./PWA_MANIFEST.md): a host that provides the worker below gets the behaviour below, and a host that provides nothing gets the reader as it always was.

## The problem it solves

Sections render in `srcdoc` iframes (patch 6 in `vendor/foliate-js/VENDORED.md`) so the single file opens from disk. Foliate rewrites every static reference it can find to a `blob:` URL before delivery, but a `srcdoc` document's address is `about:srcdoc`, so a reference that a consented book's script builds at runtime, a `<video>` created on click from a chapter-relative path, resolves to nothing. A `<base>` is not enough: a real book's runtime was seen building its paths from `location.href`, which no base changes. The EPUB rule is that references resolve against the file they are written in; giving the section a real address and answering it is what a reading system does.

## Contract

Where a service worker controls the reader page, the reader:

- loads each section by navigating its frame to `/__book/<book id>/<container path>` (vendored patch 8) instead of setting `srcdoc`, so the section document's address is that URL and relative references resolve under it;
- answers the worker's `book-file` message for the open book while it is open: the message is `{ type: 'book-file', workspaceId, path }` with a reply port, and the reply is `{ ok: true, bytes, contentType }` for a file of the book, `{ ok: false, reason: 'not-found' }` for a file the book lacks, or `{ ok: false, reason: 'not-mine' }` when `workspaceId` is not the open book's id, so another page on the origin may still answer.

The book id is the library id (the SHA-256 of the bytes). The container path is the path inside the EPUB container, so `OEBPS/video/clip.mp4` for a manifest item at that href.

A section's own URL is answered with the markup the engine prepared for it: scripts stripped unless the book has consent (§3.4), clip `data-src` rewritten, static references already pointing at `blob:` URLs, which a same-origin document may use. Any other markup answered over the route is stripped the same way unless the book has consent, so the route never hands out more than a frame would have received.

The worker is the host's. It must own the route `/__book/` on the origin, ask every window client with a `MessageChannel`, treat the first `ok` as the answer, and honour `Range` requests, since WebKit will not play media from a server that ignores them. SEED.html's worker is the first such host, and the reader shares its origin at `readitinabook.com/read/`; a dedicated origin would ship a worker of the same shape.

Where no worker controls the page, a `file://` copy, a plain static host, or a hosted page before its first visit installs the worker, nothing here runs: sections load as `srcdoc`, no message is answered, and a runtime reference resolves to nothing, as before.

## Engines

Verified on 25 September 2026 with spikes, not the e2e suite, which runs without a worker:

- A section frame with foliate's `sandbox="allow-same-origin allow-scripts"` navigated to a URL is served by the page's worker in Chromium, WebKit and Firefox.
- A sandboxed `srcdoc` frame is served in Chromium and WebKit but not Firefox, which is one more reason the served path navigates rather than adds a `<base>`.
- End to end (the built READ.html under SEED.html's worker, a real interactive book, its scripts enabled): the section's address is its served URL and its runtime-built video plays, in Chromium and WebKit.

## Notes

- Consented scripts already run with the origin's authority (the threat model in [SPEC.md](./SPEC.md), M5). The route exposes the book's own bytes to the book and adds nothing to that model.
- The e2e suite runs without a worker and never sees a base; a host's integration is that host's to test.
