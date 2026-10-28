# Testing

The repository does not currently include a persistent automated test suite. Use the syntax check and manual scenarios below when making changes.

## Basic checks

From the repository root, with Node.js installed:

```bash
node --check src/js/game.js
git diff --check
```

Open `index.html` directly and confirm that the stylesheet and game script load without console errors. Also test through a local server when checking mobile devices:

```bash
python3 -m http.server 8000
```

## Input and contact

- Start a session with a mouse click and a single-finger tap.
- Drag near the ball in different directions and verify that the preview points opposite the drag.
- Compare short and long pulls; both the power display and actual ball speed should change.
- Release a drag and confirm that the contact screen appears before the kick begins.
- Tap the center, left, right, lower, and upper parts of the close-up ball. Confirm straight travel, opposite-side curve, more loft, and lower flight respectively.
- Tap outside the close-up ball, then inside it. The first tap should leave contact selection available.
- Let the six-second contact window expire. A weaker, less accurate kick should execute and resolve.
- Cancel an aiming gesture or move focus away during a drag. No kick should be committed, and a new drag should still work.
- Release outside the Canvas after beginning a captured drag. The gesture should resolve once, without duplicate kicks.

## Highlight scenarios

| Scenario | Checks |
| --- | --- |
| One on one | A strong corner shot can score; a central shot can be saved; an inaccurate shot can miss. |
| From distance | Powerful shots reach the goal; poor power or excessive loft can lose the chance. |
| The through ball | A pass toward the run marker can be received; control then transfers to the receiver for the next action. |
| Two against two | Both action modes work; teammates can receive and return a pass; defenders can intercept passes and block shots. |
| Read the game | An early tap near the marked space can meet the pass; poor positioning or no input loses the chance. |

## Session flow

- Complete all five highlights and verify that every resolved chance offers a clear result.
- Confirm that the fifth result opens the session summary with goals, successful passes, missed chances, and a score from 0 to 100.
- Restart before and after a completed pass. Statistics from the current highlight should reset without changing earlier highlights.
- Restart during the brief goal or save animation. The previous result must not interrupt the restarted highlight.
- Use **Play Again** and confirm that the session restarts at highlight one with empty statistics.
- Toggle audio and verify that the game also works with sound disabled.

## Responsive checks

Use browser device emulation for a quick pass, followed by physical devices when available.

| Viewport | Purpose |
| --- | --- |
| 320 × 568 | Small portrait phone |
| 375 × 667 | Compact portrait phone |
| 390 × 844 | Taller portrait phone |
| 844 × 390 | Phone landscape |
| 768 × 1024 | Tablet portrait |
| 1024 × 768 | Tablet landscape |
| 1280 × 900 | Desktop |

Check for horizontal overflow, clipped overlays, and overlapping contact controls. During play, the ball, action buttons, and power display should remain usable. Confirm that the backing Canvas stays sharp on high-DPI displays and that resizing preserves correct pointer mapping.

Dragging on the pitch should not scroll or zoom the page. Touch targets must work without hover, a keyboard, or multi-touch.

## Validation history

During initial development, core gameplay and session flow were checked in Chrome with mouse input and emulated mobile touch. Checks covered goals, saves, misses, receiving and returning passes, defender collisions, off-ball receiving, spin and loft, contact timeout, gesture cancellation, restart, and the session summary.

These checks do not constitute physical-device coverage or validation of every browser. Record the browsers, devices, viewport sizes, and checks used for each subsequent change in its pull request.
