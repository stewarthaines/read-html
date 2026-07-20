# Changelog

Notable changes to READ.html, described from the reader's point of view. Implementation detail lives in the git history. This project follows [Semantic Versioning](https://semver.org).

## [Unreleased]

### Added

- A book downloaded from a link or a catalog offers **Edit in SEED.html** in the reader's settings, opening that book in the editor. The link stays with the book in your library.

### Changed

- The reader's settings show a trust checkbox for the book you're reading; the full list of trusted books stays in the library's settings.
- Reading mode is now a pair of choices: **Pages** or **Scroll**, and under Pages, **Auto** or **Single** columns. Auto fits two pages side by side where there's room; Single keeps one at any width.

## [0.4.0] — 2026-07-18

### Added

- The reader has a **Download** button that saves the book you're reading, the same as downloading it from your library.
- Browsing a catalog now shows books that link to a details page (like Project Gutenberg's listings) with their covers, and prefers the EPUB when a book is offered in several formats; whether a book can then be downloaded depends on its server allowing cross-origin (CORS) access.
- A catalog entry for a book already in your library shows **Update available** when the catalog offers a newer version, and updating replaces your copy.

### Changed

- Books that a catalog only offers to buy, borrow, or as a non-EPUB format are shown but marked, rather than failing when you try to open them.
- Catalogs now open in a pane on the library screen; a browsed catalog fills the main area instead of taking over the screen.
- The library navigates like the reader: your collection is home (its bar reads **Library**), and browsing a catalog shows the catalog's title with the sources menu still at hand and a back button that returns to your collection.
- The sources pane highlights the catalog you're viewing and shows its trust and remove controls only for that one.
- Opening a catalog by link (`?catalog=`) now remembers it as a saved source.
- A catalog book you already have shows **Open** instead of **Download**, and opens your existing copy rather than fetching it again.

## [0.3.0] — 2026-07-18

### Added

- The reader can be installed as an app where the site hosting it provides a web app manifest; nothing changes for readers whose host doesn't.

### Fixed

- Books now open on older browsers such as iOS 16 (e.g. iPhone 8), which previously failed with "undefined is not a function" when opening any EPUB.

## [0.2.0] — 2026-07-17

### Added

- Download a book from your library, saved under its original filename and identical to the file you imported.

## [0.1.0] — 2026-07-17

First tracked release — a focused, in-browser EPUB reader.

### Added

- Open an EPUB from the file picker, by dragging it onto the page, or with a `?book=<url>` link.
- Library of imported books showing cover, title, author, and reading progress; open or delete each.
- Paginated and scrolled reading modes, remembered between visits.
- Adjustable font size for book text.
- Light, dark, and automatic themes for both the app and book content.
- Reading position saved per book and restored when you reopen it.
- Table of contents drawer with titles that wrap; close it by its button, a click outside, or Escape.
- Right-to-left books page in reading order, with direction-aware navigation.
- A one-time prompt before an interactive (scripted) book runs its scripts; trusted books are listed and revocable in Settings.
- OPDS catalogs: add one by URL, browse it, and download books to your library; open a catalog directly with a `?catalog=<url>` link.
- A single self-contained `READ.html` that works offline from disk in every major browser, and can carry a book embedded inside it.
- Keyboard navigation throughout, using native controls with visible focus.

### Notes

- No accounts, no server, no tracking — your library, settings, and reading positions stay in your browser.
- Safari clears in-browser storage after seven days without a visit; reopen the reader from time to time, or re-import books (re-importing the same file restores it in place).
