# Testing

The repository includes dependency-free regression tests using Node's built-in test runner. They run the game in a minimal browser stub to verify physics, state transitions, resolution animations, and render ordering. Use the real-browser checks below to assess visual readability and input; unit tests alone cannot establish that an animation is easy to follow.

## Basic checks

From the repository root, with Node.js installed:

```bash
node --check src/js/game.js
node --check src/js/environment.js
node --check src/js/defense.js
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
| Two against two | Aim freely toward goal or teammates; teammates can receive and return a pass; defenders can intercept passes and block shots. |
| Win the Ball | Hold to chase, release on green to win possession; early/late release misses; no input or holding too long lets red escape. |
| Cut the Pass | Tap to position blue, meet the live red pass automatically; wrong placement, late movement or no input lets it through. |
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
| Central shot, full power, contact at the bottom edge | The entire ball clears the crossbar and exits the frame; the goal and camera stay fixed, the score stays unchanged, and the result follows promptly. |
| Central shot, full power, contact about 75% below center | The ball grazes the crossbar and rebounds out; it must not be credited as a goal. |
| Shot aimed directly at an upright | The ball rebounds off the post and is reported as a frame hit. |
| Shot outside the posts | The ball continues wide; it must not hit or disturb the net. |

During flight, the **HEIGHT** meter must distinguish rising and dropping and show the crossbar marker. Outcome banners must fit within the Canvas at every zoom/viewport and leave the active ball visible. An airborne ball above the bar must be drawn in front of the frame, while a scored ball remains behind it. Restart must clear the old banner, net motion, and crossing marker.

For high misses, compare full power with 85%, 90%, and 100% below-center contact, and compare full bottom contact at 65%, 80%, and 100% power. The trajectory must vary without a stationary impact marker at the goal line. On desktop, portrait, and short landscape screens, the camera must stay fixed and the entire goal must remain visible. The ball should leave the frame without rebounding, then the result should appear within 2.5 seconds of the goal-line crossing. Verify that the apron is short and the full stands/wall/trees remain behind it in all three venues. There must be no long central corridor or camera journey after the ball.

Test full-power bottom contact with left, central, and right aim directions: these strongly lofted shots must be able to go out without rebounding. Also check shots just outside both upper goal corners. The frame uses finite rounded segments; there must be no rectangular collision area above or beside a post. Cosmetic growth of an airborne ball must not enlarge its collision radius.

## Session flow

- Complete all seven highlights and verify that every resolved chance offers a clear result.
- Confirm that the sixth result opens the session summary with goals, successful passes, balls won, missed chances, and a score from 0 to 100.
- Restart before and after a completed pass. Statistics from the current highlight should reset without changing earlier highlights.
- Restart during the brief goal or save animation. The previous result must not interrupt the restarted highlight.
- Use **Play Again** and confirm that the session restarts at highlight one with empty statistics.
- Toggle audio and verify that the game also works with sound disabled.

## Win the Ball

- Start the sixth highlight through NEXT or CHOOSE HIGHLIGHT. Verify 6/7, red possession, and HOLD TO CHASE next to the ball.
- Hold anywhere on the pitch; blue must pursue without needing a path or steering. Move the held pointer and add a secondary pointer: neither should affect pursuit or trigger a tackle.
- Release when the ball ring turns green and says RELEASE! Confirm immediate BALL WON!, a visible lunge, and transferred possession. The animation must not reverse the decision.
- Release immediately, or just after green: both must produce MISSED TACKLE! while red retains possession. Holding through every opportunity and doing nothing must produce OPPONENT ESCAPED! within ten seconds.
- Retry through all three approaches. Each must have a readable opportunity; the same memorized hold duration should not fit every variant.
- Repeat with mouse and touch, portrait and short landscape. The ball ring and prompt must remain readable and follow the actual ball.
- Cancel a held pointer, rotate, blur the page, or open a dialog: pursuit must stop without tackling. Dialogs pause the clock. Resume with a fresh hold. Restart must clear the pointer, result, old possession, and statistics.
- Follow NEXT after the seventh result. Summary counts ball wins separately from goals and includes them in the rating; PLAY AGAIN resets all outcomes and statistics.

## Goalkeeper positions

- Start a full session and confirm two highlights have a keeper visibly off the line and three have a deeper keeper. **Play Again** selects a fresh arrangement.
- Restart an advanced-keeper highlight: the same starting position must return. Receiving or returning a pass must not snap the keeper to the goal line.
- Shoot low and centrally at an advanced keeper: they should still be able to save. Shoot toward the corner and verify ordinary goals remain possible.
- Try a soft chip over the exposed keeper. In the one-on-one fixture, 16% power with contact around 87% below center clears the advanced keeper and drops into the net; the same kick can be saved by the deeper keeper.
- Watch the advanced keeper react to a chip: they should backpedal gradually, with no jump to a new position. The ball must genuinely clear them before the chip-goal message appears.

## Venues and weather

- Open **Match settings** with the weather icon from both the title screen and during play. Try every combination of Stadium, Street, and Dirt with Sunny, Cloudy, Rain, and Snow.
- Confirm distinct surfaces and surroundings: stadium stripes/stands, street asphalt/fencing/buildings, and worn dirt/trees/benches. Rain should show puddles and streaks; snow should show patches and flakes. The goal and ball must remain readable.
- Switch conditions while aiming, during contact selection, while the ball is moving, and after a result. The score and highlight must survive; the match and contact timer must pause while the dialog is open.
- Open the menu during a captured drag. Closing it must leave aiming available without committing a shot.
- Close with the close button, **DONE**, and Escape. Keyboard focus should return to the weather/settings button. Check radio choices with Tab and arrow keys.
- Reload and verify restored choices. Check corrupt and unavailable storage; the game must still start and allow changes.
- At 320 × 480 and 568 × 320, scroll the dialog with touch and reach every choice, the sound toggle, and the close/done controls. Confirm no horizontal overflow.
- Enable reduced motion: rain and snow should remain static while selections and gameplay continue to work.
- Compare goals, saves, frame hits, and clear misses across environments; atmospheric effects must not change shot physics.

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

Check for horizontal overflow, clipped overlays, and overlapping contact controls. During play, the ball must remain draggable and the power indicator must appear only during a drag. Confirm that the backing Canvas stays sharp on high-DPI displays and that resizing preserves correct pointer mapping.

Dragging on the pitch should not scroll or zoom the page. Touch targets must work without hover, a keyboard, or multi-touch.

Rotate the device during an unfinished drag and confirm that it cancels without firing. Start a fresh drag after rotation and verify the preview and contact tap still line up. Repeat with the browser toolbar expanded and collapsed. Check that the contact ball stays between its heading and timer and that the session summary and replay button fit in both orientations.

## Game interface

- Confirm the arena fills the viewport without a page heading, sidebar, footer, coaching card, or scenario list.
- Check the top score, chance counter, restart, and settings controls for overlap at 320 × 480 through 1920 × 1080.
- Check all seven scenarios: no shoot/pass buttons or fixed bottom dock should appear. The power indicator should appear while dragging and disappear after release or cancellation.
- Open **?** from the title screen and during contact selection. Verify pause/resume and both close controls. The big contact ball must fit between its heading and timer.
- In settings, change venue/weather and toggle sound. Confirm these remain usable without a permanent toolbar or side panel.
- Play a complete seven-highlight session with native touch, including passes and off-ball reception. Check result/summary/replay buttons on short portrait and landscape screens.

## Highlight picker and practice

- Open **CHOOSE HIGHLIGHT** on the title screen and play each of the seven entries directly. The first four must enter aiming, the fifth off-ball reception, and the sixth hold/release defense and the seventh pass interception.
- Win or lose the defensive practice attempt, then use **RETRY**. The defensive action must restart with a clean timer, target, result, and statistics; Win the Ball rotates its approach variant.
- Use the top-left chance counter during play, or **CHOOSE HIGHLIGHT** on a result/summary, to select a different action. The picker must pause the current attempt; closing it should resume without a reset.
- Select **PLAY ALL 7** from the picker. It must start a fresh full sequence at 1/7, with normal **NEXT** progression and the final summary after the seventh highlight.
- At small portrait and short landscape sizes, scroll the picker and reach all seven cards plus **PLAY ALL 7**. Check title/result/summary selection buttons for clipping.

## Cut the Pass

- Choose the seventh card directly and enter it via NEXT after Win the Ball; verify seven cards/dots and 7/7 progress.
- Tap into the passing lane. Blue must run rather than teleport while the receiver continues moving. Change the destination before the pass and verify the run redirects.
- Meet the live pass: INTERCEPTED! must transfer possession and add one BALL WON, without awarding a goal or starting a shot.
- Do nothing, move away, or move into the lane after the ball has passed: PASS GOT THROUGH! must leave red in possession.
- Check mouse, touch, portrait, and short landscape; the selection card must be reachable by scrolling. Verify settings/help/picker pause and restart/retry state clearing.
- Finish the seventh action in a full series and verify summary, rating, replay, and returning to a different practice highlight.

## Validation history

The Cut the Pass update passes 63 automated tests. It adds real interception/possession/scoring checks, wrong/no-input/late failures, destination changes, dialog pause, restart/practice retry, and outcome consistency at 30/60/120 FPS. All previous shot, tackle, and original-five-highlight regressions also pass with seven-highlight progression. Chrome checks with native mouse and emulated touch passed success, wrong positioning, late movement, no input, retry, seven-card selection, and returning to the full sequence at 1280 × 900, 390 × 844, and 568 × 320. The short-landscape check scrolls the picker to the seventh card before selecting it. Start/flight/result screenshots were reviewed. A complete native-touch seven-highlight session passed both defensive successes, summary, replay, rotation cancellation, and existing pass/receive flows; desktop mouse shooting also passed. No runtime exceptions occurred.

The hold/release defensive redesign passes 57 automated tests, including three approach variants, readable green windows at 30/60/120 FPS, release timing, actual positioning, no-input/held-input escape, pointer cancellation, secondary pointers, dialog pause, restart, retry, and summary scoring. Chrome checks passed all three approaches with native mouse and emulated touch at 1280 × 900, 390 × 844, and 568 × 320. Early release, gesture cancellation, and holding until escape also passed with no runtime errors. The diagonal rhythm was adjusted after comparing actual hold times and rechecked at all three sizes. Screenshots of the ball ring and release prompt were reviewed. A complete native-touch six-highlight session passed through passes, reception, the new defensive hold/release, summary, and replay; desktop mouse shooting also passed.

The ball-physics update passes 56 regression tests. Real-time Chrome checks with native mouse and emulated touch (1280 × 900 and 390 × 844) also passed topped shots, bouncing goals, chips over an advanced keeper, clear over-bar misses, and curve goals; no runtime errors occurred. Bounce and chip screenshots were reviewed. A same-physics comparison against the previous keeper tracking confirmed several curved shots can now beat the keeper where continuous tracking saved them. New cases cover progressive top-contact power loss, the lift/pace tradeoff, energy loss and settling over multiple bounces, matching trajectories at 30/60/120 FPS, faster ground-spin decay, delayed keeper observations, committed dives, and a live bouncing goal with impact feedback. The soft-chip regression now uses lower contact (0.94) to account for the new forward-pace tradeoff. A complete six-highlight native-touch session, summary, replay, rotation cancellation, and desktop mouse flow also passed.

Direct-selection validation passed 48 automated tests, covering all six entry states, independent practice statistics, defensive retry, selection-menu pausing/cancellation, invalid indices, and returning to full-series progression. Native mouse/touch checks at 1280 × 900, 390 × 844, 568 × 320, and 320 × 480 selected the defensive action through the visible menu, won possession, retried it, switched to a different highlight, and started the full series. Desktop also opened all six cards directly. Title/result buttons and picker bounds were checked, with no runtime exceptions. The complete six-highlight native-touch flow, summary, replay, and desktop mouse flow also passed after the selector was added.

Win the Ball passed 43 automated tests including the original attacking regressions, six-highlight progression, real path following, ownership, all three defensive outcomes, shielding/reach checks, late arrivals, frame-rate consistency, cancellation, pause, restart, duplicate-score protection, and defensive summary/rating. Normal-speed native mouse/touch runs passed success on desktop/portrait, a mistimed tackle in short landscape, and a wrong-route escape. These ran about 5–9 seconds including the intro and had no runtime exceptions. A complete native-touch six-highlight session also passed, including passes, off-ball reception, the successful defensive action, summary, and replay. A final 320 × 480 native-touch run verified rotation cancellation, restart, settings/help pause/resume, readable timing-ring placement, the tackle lunge, all four summary statistics, and replay reset.

The unified-kick update passed 33 regression tests. Pass/return-pass tests now use the same kick helper as goals, with no mode parameter. Additional cases verify a direct goal in a combination highlight and a received pass in a long-shot highlight, preventing hidden scenario-specific action restrictions. A complete native-touch session passed through goals, a through pass, a return pass, off-ball reception, summary, and replay with no action-selection clicks; desktop mouse flow also resolved. UI checks at 320 × 480, 568 × 320, and 1280 × 900 confirmed that the selector/dock are absent and power appears only while dragging. No runtime errors occurred.

The game-interface update passed 31 regression tests and Chrome layout checks at 320 × 480, 390 × 844, 568 × 320, 844 × 390, 768 × 1024, 1280 × 900, and 1920 × 1080. Each layout covered all five scenarios, contact bounds, HUD separation, result/summary buttons, and page overflow. A complete native-touch session passed through receiving, returning passes, interception, results, summary, and replay; desktop mouse flow also resolved. Native help/settings/sound and contact pause/resume checks passed on four viewport sizes, with no runtime exceptions. Desktop, portrait, landscape, contact, help, and summary screenshots were inspected.

Keeper-position validation passed 31 automated tests, including the two/three profile mix, restart/pass stability, gradual backpedaling, ordinary saves, and a chip that scores against an advanced keeper while the same kick is saved near the line. Four normal-speed Chrome cases with native mouse/touch input passed at 390 × 844, 568 × 320, and 1280 × 900: exposed-keeper chip goal, deeper-keeper save of that chip, exposed-keeper ground save, and corner goal. Starting positions and chip clearance were visually inspected; restart restored each position and no runtime errors occurred.

The bounded-arena correction removed the long miss-follow camera and 2,400-unit rear corridor. The 26-test suite checks fixed framing and goal visibility across desktop, portrait, and short landscape sizes, clean ball exit without a rebound, prompt results, and the absence of a false impact marker.

Six normal-speed Chrome checks passed with native mouse/touch input at 390 × 844, 568 × 320, and 1280 × 900: full-power high, lower-power high, landscape high, chip goal, real crossbar hit, and desktop high. They covered stadium, street/rain, and dirt/snow. During each high miss, camera scale/offset stayed fixed and the goal remained visible; the ball exited before the result appeared, within 2.5 seconds of crossing. Recorded approach/exit frames were inspected to confirm the complete backdrop and short rear apron. No runtime errors occurred.

Venue/weather validation covered all 12 combinations in Chrome, persisted choices after reload, and verified contact-timer pausing, Escape dismissal, and restored keyboard focus. The dialog passed mouse/touch checks at 320 × 480, 390 × 844, 844 × 390, 568 × 320, 768 × 1024, and 1280 × 900, including native touch scrolling on short screens. The 23 automated tests also passed, including unchanged goal/miss outcomes across all environments and recovery from corrupt or denied storage.

Direct-file loading was additionally verified with native touch at 390 × 844: a street/rain corner shot scored, and a dirt/snow full-power loft continued over the bar. Both kicks paused and resumed through the conditions dialog during contact selection. Reduced-motion initialization and runtime error checks passed.

The frame-collision fix was checked in Chrome at 390 × 844 with native touch emulation and normal-speed playback: full-power bottom contact went over the bar, left and right misses continued outside, and a chip goal, ground goal, and actual crossbar hit retained their expected outcomes. All six cases passed without runtime exceptions. The 19 regression tests also passed, including near-corner misses at 320, 768, and 1440 pixels and full-power loft across five aim directions.

Shot-readability validation includes six normal-speed Chrome runs driven through native touch emulation: ground goal, chip goal, save, crossbar, over-bar, and wide. Approach, crossing, and resolution frames were inspected, including a recorded chip goal. Forty HUD/result-button checks across eight desktop and mobile viewport sizes and the complete mouse/touch session flow also passed. The committed unit suite guards these outcomes and the render-order, restart, net-settling, and contact-edge regressions.

During initial development, core gameplay and session flow were checked in Chrome with mouse input and emulated mobile touch. Checks covered goals, saves, misses, receiving and returning passes, defender collisions, off-ball receiving, spin and loft, contact timeout, gesture cancellation, restart, and the session summary.

The mobile layout update was additionally checked with emulated touch across 12 portrait and landscape viewports, including 320 × 480 and 568 × 320. Validation covered viewport fit, touch-sized contact geometry, device rotation during a drag, receiving and returning passes, a complete five-highlight session, summary/replay visibility, and the desktop mouse flow.

These checks do not constitute physical-device coverage or validation of every browser. Record the browsers, devices, viewport sizes, and checks used for each subsequent change in its pull request.
