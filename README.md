# READ.html

**READ.html** is a focused, in-browser EPUB reader. Its mission: the simplest way to present an EPUB to a reader who doesn't know what EPUB is and couldn't open an `.epub` file if they had one. They click a link, the book opens, they read.

## Non-goals

- Not a library manager, annotation platform, or sync service. No accounts, no server, no telemetry.
- No highlights, bookmarks, dictionaries, TTS, or in-book search in v1 — foliate-js offers modules for all of these; deliberately unused.
- No formats beyond EPUB (foliate-js's mobi/fb2/cbz parsers are excluded from the bundle).
- Not an editor. It opens finished books.

## License

MIT — see [LICENSE](LICENSE). Rendering engine: [foliate-js](https://github.com/johnfactotum/foliate-js) (MIT), vendored in `vendor/foliate-js/`.
