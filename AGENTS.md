# Project rules

- Preserve gameplay, physics constants, controls, timing, and draw order during refactors.
- Keep vanilla JavaScript, classic deferred scripts, offline operation, and `file://` support. Resolve browser assets relative to `index.html` for GitHub Pages subdirectories.
- Use `window.ShoparFootball` for newly extracted modules. Keep `window.footballGame` and its regression-test inspection surface compatible.
- Refactor one responsibility at a time and retain the verification record in `docs/REFACTOR.md`. Add highlights through registry `create(context)` factories as described in `docs/HIGHLIGHTS.md`; keep scenario branches out of the coordinator.
- Keep rendering free of gameplay mutations and controllers free of DOM, whole-game and direct statistics access. DOM and native pointer capture belong in platform modules. Keep registration before bootstrap and class loading free of startup side effects.
- Preserve existing regression assertions. Run `node scripts/check.cjs`, `node --test tests/*.test.cjs`, and `git diff --check`; run the documented browser checks for input, rendering, or lifecycle changes.
- Keep documentation and new comments in English. Record relevant browsers, viewports, input methods, and limitations.
- Do not commit generated test output, local environment files, or browser profiles. Do not push or deploy unless explicitly requested.
