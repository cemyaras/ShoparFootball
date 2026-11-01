# Architecture

## Runtime

`index.html` provides a viewport-sized arena, floating HUD and gesture input, overlays, and native settings/help dialogs. It loads `src/css/style.css` and defers `src/js/environment.js`, `src/js/defense.js`, and then `src/js/game.js` until the document has been parsed.

The JavaScript uses a strict-mode closure to keep implementation details scoped. A `FootballGame` instance is available as `window.footballGame` for inspection. The script stays compatible with direct `file://` loading; it does not require module imports, network requests, or a bundler.

## Systems

| System | Responsibility |
| --- | --- |
| Scenario definitions | Initial positions, descriptions, and coaching tips for all six highlights. |
| State machine | Valid interaction phases, overlay visibility, and progression through a session. |
| Input | Pointer capture, drag direction and power, contact selection, cancellation, and interception destinations. |
| Physics | Kick velocity, spin, height, friction, collisions, goal-line crossing, and out-of-play checks. |
| AI | Delayed goalkeeper reactions, limited movement and dives, defender pressure, and teammate receiving runs. |
| Rendering | Procedural pitch, players, ball, trajectory preview, trails, contact close-up, and celebrations. |
| Environment | Venue scenery, surface texture, weather lighting/particles, and local preferences. |
| Defense | A drawn route, opponent possession, position-dependent tackle timing, and defensive result animation. |
| Audio | Optional tones synthesized through the Web Audio API without external audio assets. |

`FootballGame` owns the state and coordinates the systems through methods. `AudioSystem` manages sound independently. Rendering reads gameplay state; simulation changes happen in the update and interaction methods.

## State transitions

| State | Behavior and exits |
| --- | --- |
| `TITLE` | Waits for play, then enters `HIGHLIGHT_INTRO`. |
| `HIGHLIGHT_INTRO` | Sets up the highlight, then enters `AIMING`, `INTERCEPTION`, or `DEFENDING`. |
| `AIMING` | Pauses field simulation while the user aims and drags; a committed aim enters `BALL_CONTACT`. |
| `BALL_CONTACT` | Waits for contact or a six-second timeout, then enters `BALL_IN_MOTION`. |
| `BALL_IN_MOTION` | Advances physics and AI. A completed pass returns to `AIMING`; a resolved chance leads to `RESULT`. |
| `INTERCEPTION` | Moves an incoming pass and lets the user choose a player destination. Receiving enters `AIMING`; losing the chance leads to `RESULT`. |
| `DEFENDING` | Lets the user draw one route, runs it while the opponent dribbles, then accepts a timed tackle. Resolution leads to `RESULT`. |
| `RESULT` | Offers the next highlight, or `SESSION_SUMMARY` after the sixth. |
| `SESSION_SUMMARY` | Shows session statistics and offers a fresh session. |

A brief pending-result delay leaves goals and saves visible before the result overlay appears. Restarting a highlight clears pending results and restores the statistics captured at its start.

## Coordinates and timing

Gameplay uses a fixed 1000 × 740 playing area with additional run-off ground behind the goal. Every viewport frames the goal and the current scenario's participants with extra room behind the ball for dragging. The transform reserves space for the top HUD and dragging below the ball. The temporary power indicator floats above the Canvas without resizing it between gameplay phases. Camera bounds update at a new highlight or possession and remain stable while aiming and striking. The camera also stays fixed during misses, keeping the goal as a visible reference. The viewport computes a uniform scale and offset. Input uses the inverse transform, so mouse and touch positions map to the same world coordinates.

Canvas backing dimensions account for device pixel ratio, capped at three. CSS controls the visible dimensions using dynamic viewport height and safe-area padding on compact screens. `ResizeObserver`, window resizing, and visual viewport resizing keep both mappings current. A resize cancels an active drag before changing its coordinate transform.

Kick power is normalized against a screen-relative drag distance instead of a fixed world distance. Contact geometry also derives from the visible Canvas dimensions, leaving room for instructions and the timer even on short landscape screens. The renderer and pointer hit detection share this geometry.

The animation loop uses `requestAnimationFrame` and delta time. Frame delta is capped after interruptions; motion updates subdivide time into steps no larger than 1/120 second to support collision checks. Field physics and AI advance during motion and interception, while aiming leaves the user time to plan.

## Goal and goalkeeper proportions

The goal has a separate front opening, rear net, roof, and side panels. Its 200-unit opening projects to 58.24 units high, compared with a 40.7-unit standing goalkeeper: the opening is approximately 1.43 times the keeper's height. The keeper uses a wider ready stance and stands 16 units in front of the goal line. These are visual design proportions inspired by the [official New Star Soccer screenshots](https://apps.apple.com/us/app/new-star-soccer/id498973162), rather than a claim about that game's internal measurements.

`GOAL.height` defines the physical crossbar threshold, and the same `HEIGHT_PROJECTION` maps ball elevation and goal height onto the Canvas. Net depth is independent of opening height. Goalkeepers can reach below the crossbar, leaving space for a well-judged chip, while excessive loft can still go over the bar. The camera includes the raised crossbar and the stadium behind it on both desktop and compact screens.

Goal-line classification uses the grounded collision radius and distances to finite, round-ended frame segments. Airborne enlargement is a visual effect and does not enlarge the collider. A ball touching an upright or crossbar rebounds; a clear shot above or beside the frame continues out. Rounded corner checks avoid invisible rectangular collision areas. The keeper's reach is tested against the bottom of the ball, keeping saves and chips consistent with the visible flight.

## Flight playback and resolution

Shots use slower playback near the goal. Ball physics and AI receive the same scaled delta time, while interface timers use real time. A height meter and ground-shadow separation distinguish low shots from rising and dropping chips. Outcome banners use Canvas screen coordinates so their text stays readable independently of the world camera.

A resolved chance retains its physical outcome while a brief animation plays. Goals advance into the net, rebound from its rear and sides, and fall to the floor; net motion begins on impact. Saves draw the held ball over the keeper's hands. High and wide shots continue beyond the goal, and frame hits rebound toward the field. Airborne misses keep their velocity and gravity while leaving the visible arena. Once the entire ball is outside the Canvas, the result follows after a short pause. A maximum delay prevents long waits for distant, offscreen landings.

All venues have a short, finite apron behind the net, followed by their complete stands, wall, or trees. The rear scenery is shifted by only 55 world units; there is no corridor cut through it. Shots do not pan or zoom the camera away from the goal. Venue decorations have no collision surfaces, so a clear miss exits the frame without an invented rebound.

Ground shadows are rendered beneath players. Low balls use ground depth ordering, airborne balls are rendered over players, and balls above the goal render after the frame. Crossing markers highlight successful goals and actual frame impacts. Clear misses have no stationary goal-line marker that could be mistaken for a collision. These presentation effects do not award goals independently of the goal-line collision check.

## Player and ball scale

Outfield players and the on-field ball share a world-space depth scale, from 1.1 near the goal to 1.6 in the foreground. At the same depth, a grounded ball's diameter is 23% of a standing outfield player's height. Airborne growth is capped at 18%, so loft does not turn the ball into an oversized foreground object. These are approximate visual proportions informed by the official screenshots linked above, not measurements of proprietary game internals.

The keeper retains the goal proportions described above. Player/ball ratios are independent of viewport size and device pixel ratio; the ball is not enlarged to enforce a minimum CSS size. Its outline and trail preserve visibility, while pointer input retains a separate generous hit area. The contact close-up remains large for accurate single-finger selection.

## Goalkeeper positioning

The original five attacking highlights retain their shuffled plan with two advanced keepers and three near the goal line; the defensive highlight does not use goalkeeper controls. A near-line keeper starts at y = 100; an advanced keeper starts at y = 174, leaving a visible gap behind them. The plan belongs to the session, so restarting the same highlight preserves the initial placement. A new session shuffles again.

Both profiles read the visible ball flight every 160 ms after the initial reaction delay. A dive commits to its direction and lateral target until the animation ends, allowing late curve to beat an early commitment. Neither profile reads the chosen contact point or planned trajectory. An advanced keeper holds depth against ground shots and passes, then backpedals at a limited speed when a lofted shot approaches. This creates a real chip opportunity without teleporting back to the line or changing shot physics. Keeper-clearance detection compares the ball against the moving keeper plane, and the intro/coach text calls attention to the open space.

## Ball contact and possession

Possession, reception, and kick execution use the same foot-level ball position. The ball sits beside the right boot, and the aim preview begins at the same point as the actual kick. Goalkeeper reaction timing allows for this slightly longer shooting distance while keeping central shots saveable.

Drag distance sets kick power, and the opposite drag vector sets direction. The contact tap is normalized within the close-up ball. Its horizontal offset sets spin, its vertical offset changes loft and forward pace, and edge or late contact affects accuracy or strength. Upper contact progressively loses power; lower contact trades some forward speed for lift. Shot power scales upward launch as well as forward velocity, so full-power bottom contact can clear the bar rather than repeatedly arriving at crossbar height. Ball integration uses steps no larger than 1/240 second, rotates velocity without adding curve energy, and solves the time of ground contact within a step. Landings retain 46% of vertical impact speed above a settling threshold, reduce horizontal speed and spin, and return an impact event. Live callers emit a short ground ring and optional bounce sound; aim previews remain free of effects. Spin decays much faster on the ground and has less influence on rolling direction. Scored balls use 20% restitution inside the net to settle during the result animation. All kicks share this launch model, friction, and playback timing; there is no shot/pass mode or hidden intent classification.

The aim preview and live motion share the velocity and integration methods. The preview assumes central contact; the later contact tap can change the actual trajectory.

Every kick can become a pass when a teammate reaches it. Teammates always react to the moving ball and receive it when close enough and below the receiving-height threshold, independent of highlight type. Possession then transfers to the receiver. Defenders can intercept or block before reception. The off-ball scenario uses a moving incoming pass and a tap-selected player destination.

## Lifecycle and storage

Event listeners are registered through a helper that records cleanup functions. `destroy()` removes listeners, disconnects the resize observer, cancels the animation frame, and closes the audio context.

Session statistics and outcomes are held in memory. `FootballEnvironment` stores only the selected venue and forecast under `shopar-football.conditions` in local storage. Unknown values are ignored; corrupt or denied storage falls back safely to stadium/sunny. The game works without storage or a backend.

## Venues and weather

`FootballEnvironment` renders three venues with shared field markings and goal geometry. The stadium retains striped grass and animated stands. The street venue adds asphalt, cracks, apartment fronts, brickwork, and a chain-link fence. The dirt venue adds a worn earth surface, trees, timber rails, and benches.

Four independent weather presets alter the presentation. Rain adds puddles and moving streaks; snow adds ground patches and drifting flakes. Cloudy weather cools/dims the scene, while sunny weather adds a warm tint. Particle counts are fixed, textures use deterministic positions, and reduced-motion users receive static precipitation. Atmosphere is drawn before the contact close-up and outcome banner, keeping play feedback legible.

The native settings, help, and selection dialogs provide keyboard focus trapping, Escape dismissal, and focus restoration. Opening a settings/help/selection dialog cancels a captured drag and pauses `update`, including contact timeouts and pending results. Closing a dialog resets the frame timestamp before resuming. Selections update immediately without reloading actors or changing physics, session progress, or scores.

## Game interface

The arena occupies the viewport with no document-style header, sidebar, or footer. Score and six-chance progress form a small top HUD. There is no kick-selection dock. A non-interactive power track appears near the bottom only while dragging. Settings contain venue, weather, and sound; the question-mark button opens a short control guide. Instructions are available on demand instead of remaining around the pitch. Scenario names and exposed-keeper warnings appear briefly as toasts. Detailed result/flight announcements remain available to assistive technology, while the visible UI emphasizes the ball, outcome, and next action.

## Win the Ball

`DefensiveHighlight` encapsulates the sixth highlight and reuses the existing player objects, `movePlayer`, Pointer Events, Canvas transform, sprites, audio, banners, and result/summary flow. The `DEFENDING` state has planning, running, and resolved phases. It uses a stable camera focused on the two participants. No attacking physics or input rules change in the original five highlights.

Red starts in possession. Its deterministic dribble moves continuously, including while a route is drawn; blue follows the actual sampled polyline at a bounded speed after release. Sampling filters near-duplicate points and limits route length/point count. Cancellation discards only the preview; restart releases pointer capture before rebuilding the highlight. Settings/help pause both movement and the defensive clock.

The tackle ring appears within 82 world units. Its cursor shares a 1.2-second cycle with the dribbler's exposed-ball animation. Green requires all of: an actual ball distance of at most 43 units, a side/front approach rather than a shielded position behind red, and the visible timing window. Tapping outside that window while close produces `missed_tackle`; tapping from too far away cannot win possession. An unsuccessful route or no action reaches `opponent_escaped` at 7.2 seconds of active play. The intro and 1.3-second resolution put normal runs at approximately 5–10 seconds.

A successful tackle lunges the blue sprite toward the ball, extends a leg, and transfers the ball to its boot. Failure leaves red in possession and moving away. `ball_won` counts as a successful highlight and increments `stats.tackles`, without incrementing goals or starting a counterattack. The summary exposes **BALL WON** and rates the six-highlight session with 14 points per goal/ball win, up to nine pass points, and seven for off-ball reception (capped at 100).

## Direct highlight selection

The picker is populated from `SCENARIOS` and opens from the title, chance counter, results, or summary. It pauses the same simulation/timers as settings and help; closing it preserves the current attempt. `practiceIndex` is null for the full six-highlight sequence, or the chosen scenario index for single-highlight practice. Starting a selection resets session statistics and transient state through the existing highlight setup. Practice results use **RETRY**, which calls the existing restart path instead of advancing or opening the summary. **PLAY ALL 6** clears practice mode and begins the original sequence at highlight one.
