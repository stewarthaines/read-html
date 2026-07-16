# READ.html — feature spec

Living acceptance criteria, extracted from and subordinate to `docs/BOOTSTRAP.md` (the founding spec). Every feature lands as: (1) acceptance criteria here, (2) a failing e2e or unit test, (3) implementation to green.

## M0 — scaffold

Accepted when all of the following hold:

- `npm run validate` passes: svelte-check (`--fail-on-warnings`) + `tsc` for node-side scripts/configs, ESLint (`--max-warnings 0`), Prettier check, knip dead-code check, vitest unit tests, and `vendor-check`.
- The empty app shell renders: document title is `READ.html`, a `<main>` region fills the viewport, app chrome uses system fonts and system colors with `prefers-color-scheme` respected.
- Placeholder e2e (`e2e/shell.spec.ts`) passes on Chromium and WebKit; Firefox runs as a best-effort, non-blocking CI job.
- `vendor-check` (part of `validate`) verifies the two foliate-js integration points READ.html depends on: the section-iframe `sandbox` attribute in `paginator.js` and the `data` CustomEvent dispatch in `epub.js`'s `Loader.createURL`. Unit tests cover both the intact and the changed-upstream case.
- foliate-js is vendored at a pinned commit with `LICENSE` and `VENDORED.md` (commit hash, patch list, update procedure); only the EPUB path is vendored, excluded formats cannot appear in the bundle (their format branches are patched out of `view.js`).
- `npm run build` produces the hosted `dist/`, and `npm run smoke` boots it headlessly and asserts the shell renders.
- CI (`.woodpecker.yml`) runs validate, build + smoke, and the Playwright suite on every push.
