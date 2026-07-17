# Changelog

Notable changes to READ.html, described from the reader's point of view. Implementation detail lives in the git history. This project follows [Semantic Versioning](https://semver.org).

## [Unreleased]

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
