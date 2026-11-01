# Project rules

- Read only files relevant to the task. Avoid rereading entire source trees or documentation.
- Preserve gameplay, physics constants, controls, timing, and draw order during refactors.
- Keep vanilla JavaScript, classic deferred scripts, offline operation, and `file://` support. Resolve browser assets relative to `index.html` for GitHub Pages subdirectories.
- Use `window.ShoparFootball` for newly extracted modules. Keep `window.footballGame` and its regression-test inspection surface compatible.
- Refactor one responsibility at a time. `docs/REFACTOR.md` is the historical record of the completed refactor; do not update it for new features. Add highlights through registry `create(context)` factories as described in `docs/HIGHLIGHTS.md`; keep scenario branches out of the coordinator.
- Keep rendering free of gameplay mutations and controllers free of DOM, whole-game and direct statistics access. DOM and native pointer capture belong in platform modules. Keep registration before bootstrap and class loading free of startup side effects.
- During development, run only tests affected by the change. Small edits do not require the full suite.
- At completion of code or behavior changes, run `node --test tests/*.test.cjs` once, plus `node scripts/check.cjs` and `git diff --check`.
- Repeat passing checks only when a new relevant change, failure, or unresolved risk justifies it.
- For documentation-only changes, skip game tests and use `git diff --check`.
- Use browser tests only for changes affecting input, rendering, lifecycle, or gameplay; select the affected flows.
- Preserve existing tests and assertions. Do not delete tests or weaken assertions; verify intended behavior changes with appropriate coverage.
- Report passing tests with only their count and success status. For failures, include the relevant error details, not full logs.
- Keep documentation and new comments in English.
- Do not commit generated test output, local environment files, or browser profiles. Do not push or deploy unless explicitly requested.
