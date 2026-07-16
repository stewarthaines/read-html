# Agent working agreement

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

## Delegation and model tiering

Frontier-model attention is the project's scarcest resource; spend it on judgment, not typing. The TDD discipline in §7 exists partly to make delegation safe: a task is **delegable to a cheaper/faster sub-agent when its done-condition is mechanical** — a named failing test to turn green, a written spec to transcribe, a checkable output format.

- **Delegate down** (tightly specified, verified by `npm run validate` + named tests): implementing a module to an already-written interface and failing test suite; fixture-generator work to §6's spec; test skeletons transcribed from written acceptance criteria; config/boilerplate; mechanical refactors (renames, import moves); i18n string extraction.
- **Never delegate down**: anything in §3.4 (scripting/consent/security), foliate-js integration points and vendored-code patches, spec and acceptance-criteria authoring, storage-schema decisions, dependency choices, and any task whose instructions contain the word "probably."
- The lead agent reviews every delegated diff before it is committed, and the sub-agent must run validation itself and report results — an unverified "done" is not done.
- Write delegated task prompts as if for a competent contractor with no project context: name the files, the interface, the test command, and the definition of done. If the prompt is hard to write that precisely, the task is not delegable — do it in the lead context.

## Project references

Section references (§N) above refer to `docs/BOOTSTRAP.md`, the founding spec. Re-read it at the start of each milestone. `docs/SPEC.md` holds living acceptance criteria; `docs/CONTENT_CONVENTIONS.md` holds the publisher content contract.
