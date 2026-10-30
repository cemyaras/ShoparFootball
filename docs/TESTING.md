# Testing

The repository includes dependency-free regression tests using Node's built-in test runner. They run the game in a minimal browser stub to verify physics, state transitions, resolution animations, and render ordering. Use the real-browser checks below to assess visual readability and input; unit tests alone cannot establish that an animation is easy to follow.

## Basic checks

From the repository root, with Node.js installed:

```bash
node --check src/js/game.js
node --test tests/game.test.cjs
git diff --check
```

The GitHub Pages workflow runs the syntax check and regression tests before building and deploying. Parse errors or failing gameplay checks block publication.

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

## Player, ball, and goal proportions

- At the same field depth, check that the ground ball is approximately 23% of an outfield player's height and smaller than the player's head. Foreground players should appear slightly larger than players near the goal.
- Check that the possessed ball sits beside the boot after setup, reception, and restart. The preview and actual kick must begin at that position.
- Compare desktop, portrait, landscape, and high-DPI layouts. Ball/player proportions should remain stable, and the smaller painted ball must still accept a touch within the generous drag target.
- Loft the ball and confirm that its diameter grows by at most 18%. The contact close-up must remain large and easy to tap.

- Check that the goal has upright posts, an open front, and separate rear, roof, and side netting. The opening should be approximately 1.43 times a standing keeper's height.
- Verify that the roof, crossbar, and keeper remain inside the Canvas on portrait phones and short landscape screens.
- Shoot centrally along the ground and verify that the keeper can save it. A chip that clears the keeper but remains below the bar should be able to score.
- Try excessive loft and check for an over-the-bar result. Shots crossing just below and just above the crossbar height must produce different results.
- Confirm that wide shots still miss and that the net reacts after a goal.

## Shot readability in a real browser

Watch each case at normal playback speed on a desktop and a portrait/landscape phone viewport. Capture frames during approach, at the goal line, and after the outcome; verify the animation itself as well as the result text.

| Shot | Expected visible behavior |
| --- | --- |
| Firm corner shot with central contact | Ground shadow stays close to the ball; it crosses below the bar, hits the net, rebounds gently, and settles inside. |
| Central shot with central contact | The ball collides with the keeper, moves into their hands, and stays there. |
| Central shot, full power, contact about 60% below center | The ball separates from its shadow, clears the keeper, fits under the bar, and drops into the net. |
| Central shot, full power, contact at the bottom edge | The entire ball clears the crossbar, continues behind the goal, and the score stays unchanged. |
| Central shot, full power, contact about 75% below center | The ball grazes the crossbar and rebounds out; it must not be credited as a goal. |
| Shot aimed directly at an upright | The ball rebounds off the post and is reported as a frame hit. |
| Shot outside the posts | The ball continues wide; it must not hit or disturb the net. |

During flight, the **HEIGHT** meter must distinguish rising and dropping and show the crossbar marker. Outcome banners must fit within the Canvas at every zoom/viewport and leave the goal visible. An airborne ball above the bar must be drawn in front of the frame, while a scored ball remains behind it. Restart must clear the old banner, net motion, and crossing marker.

Test full-power bottom contact with left, central, and right aim directions: these strongly lofted shots must be able to go out without rebounding. Also check shots just outside both upper goal corners. The frame uses finite rounded segments; there must be no rectangular collision area above or beside a post. Cosmetic growth of an airborne ball must not enlarge its collision radius.

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
| 320 × 480 | Short portrait viewport, including browser chrome |
| 320 × 568 | Small portrait phone |
| 375 × 667 | Compact portrait phone |
| 390 × 844 | Taller portrait phone |
| 844 × 390 | Phone landscape |
| 568 × 320 | Short landscape phone |
| 768 × 1024 | Tablet portrait |
| 1024 × 768 | Tablet landscape |
| 1280 × 900 | Desktop |

Check for horizontal overflow, clipped overlays, and overlapping contact controls. During play, the ball, action buttons, and power display should remain usable. Confirm that the backing Canvas stays sharp on high-DPI displays and that resizing preserves correct pointer mapping.

Dragging on the pitch should not scroll or zoom the page. Touch targets must work without hover, a keyboard, or multi-touch.

Rotate the device during an unfinished drag and confirm that it cancels without firing. Start a fresh drag after rotation and verify the preview and contact tap still line up. Repeat with the browser toolbar expanded and collapsed. Check that the contact ball stays between its heading and timer and that the session summary and replay button fit in both orientations.

## Validation history

The frame-collision fix was checked in Chrome at 390 × 844 with native touch emulation and normal-speed playback: full-power bottom contact went over the bar, left and right misses continued outside, and a chip goal, ground goal, and actual crossbar hit retained their expected outcomes. All six cases passed without runtime exceptions. The 19 regression tests also passed, including near-corner misses at 320, 768, and 1440 pixels and full-power loft across five aim directions.

Shot-readability validation includes six normal-speed Chrome runs driven through native touch emulation: ground goal, chip goal, save, crossbar, over-bar, and wide. Approach, crossing, and resolution frames were inspected, including a recorded chip goal. Forty HUD/result-button checks across eight desktop and mobile viewport sizes and the complete mouse/touch session flow also passed. The committed unit suite guards these outcomes and the render-order, restart, net-settling, and contact-edge regressions.

During initial development, core gameplay and session flow were checked in Chrome with mouse input and emulated mobile touch. Checks covered goals, saves, misses, receiving and returning passes, defender collisions, off-ball receiving, spin and loft, contact timeout, gesture cancellation, restart, and the session summary.

The mobile layout update was additionally checked with emulated touch across 12 portrait and landscape viewports, including 320 × 480 and 568 × 320. Validation covered viewport fit, touch-sized contact geometry, device rotation during a drag, receiving and returning passes, a complete five-highlight session, summary/replay visibility, and the desktop mouse flow.

These checks do not constitute physical-device coverage or validation of every browser. Record the browsers, devices, viewport sizes, and checks used for each subsequent change in its pull request.
