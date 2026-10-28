# Contributing

## Local development

1. Open `index.html` in a browser, or serve the repository root with `python3 -m http.server 8000`.
2. Make focused changes in `src/` or the root HTML entry point.
3. Reload the browser and exercise the affected game flow.
4. Run the relevant checks in [Testing](docs/TESTING.md).

## Project conventions

- Use vanilla JavaScript, CSS, and Canvas APIs. Preserve offline operation and direct opening of `index.html`.
- Use the settings in `.editorconfig`: UTF-8, LF line endings, and two-space indentation.
- Keep source code in `src/`, technical documentation in `docs/`, and repository configuration at the root.
- Keep documentation and code comments in English.
- Resolve browser resources relative to `index.html`; avoid absolute paths that break static hosting in a subdirectory.
- Use Pointer Events for shared mouse and single-finger interaction.
- Keep gameplay updates separate from rendering and validate interactions against the current game state.
- Preserve the world-coordinate mapping and device-pixel-ratio handling when changing the renderer or input system.

## Submitting changes

Describe the problem, the resulting behavior, and the checks you ran. For changes to visuals or input, include the viewport sizes and input methods tested, plus screenshots when helpful.

Update the README or technical documentation when controls, file paths, or game behavior change. Do not commit local environment files, editor state, logs, or generated test output.
