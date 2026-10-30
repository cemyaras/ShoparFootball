# Architecture

## Runtime

`index.html` provides the page structure, Canvas, controls, and overlays. It loads `src/css/style.css` and defers execution of `src/js/game.js` until the document has been parsed.

The JavaScript uses a strict-mode closure to keep implementation details scoped. A `FootballGame` instance is available as `window.footballGame` for inspection. The script stays compatible with direct `file://` loading; it does not require module imports, network requests, or a bundler.

## Systems

| System | Responsibility |
| --- | --- |
| Scenario definitions | Initial positions, default actions, descriptions, and coaching tips for all five highlights. |
| State machine | Valid interaction phases, overlay visibility, and progression through a session. |
| Input | Pointer capture, drag direction and power, contact selection, cancellation, and interception destinations. |
| Physics | Kick velocity, spin, height, friction, collisions, goal-line crossing, and out-of-play checks. |
| AI | Delayed goalkeeper reactions, limited movement and dives, defender pressure, and teammate receiving runs. |
| Rendering | Procedural pitch, players, ball, trajectory preview, trails, contact close-up, and celebrations. |
| Audio | Optional tones synthesized through the Web Audio API without external audio assets. |

`FootballGame` owns the state and coordinates the systems through methods. `AudioSystem` manages sound independently. Rendering reads gameplay state; simulation changes happen in the update and interaction methods.

## State transitions

| State | Behavior and exits |
| --- | --- |
| `TITLE` | Waits for play, then enters `HIGHLIGHT_INTRO`. |
| `HIGHLIGHT_INTRO` | Sets up the highlight, then enters `AIMING` or `INTERCEPTION`. |
| `AIMING` | Pauses field simulation while the user selects an action and drags; a committed aim enters `BALL_CONTACT`. |
| `BALL_CONTACT` | Waits for contact or a six-second timeout, then enters `BALL_IN_MOTION`. |
| `BALL_IN_MOTION` | Advances physics and AI. A completed pass returns to `AIMING`; a resolved chance leads to `RESULT`. |
| `INTERCEPTION` | Moves an incoming pass and lets the user choose a player destination. Receiving enters `AIMING`; losing the chance leads to `RESULT`. |
| `RESULT` | Offers the next highlight, or `SESSION_SUMMARY` after the fifth. |
| `SESSION_SUMMARY` | Shows session statistics and offers a fresh session. |

A brief pending-result delay leaves goals and saves visible before the result overlay appears. Restarting a highlight clears pending results and restores the statistics captured at its start.

## Coordinates and timing

Gameplay uses a fixed 1000 × 740 world. The desktop viewport fits that world; the compact layout frames the goal and the current scenario's participants with extra room behind the ball for dragging. Camera bounds update at a new highlight or possession and remain stable during a kick. The viewport computes a uniform scale and offset. Input uses the inverse transform, so mouse and touch positions map to the same world coordinates.

Canvas backing dimensions account for device pixel ratio, capped at three. CSS controls the visible dimensions using dynamic viewport height and safe-area padding on compact screens. `ResizeObserver`, window resizing, and visual viewport resizing keep both mappings current. A resize cancels an active drag before changing its coordinate transform.

Kick power is normalized against a screen-relative drag distance instead of a fixed world distance. Contact geometry also derives from the visible Canvas dimensions, leaving room for instructions and the timer even on short landscape screens. The renderer and pointer hit detection share this geometry.

The animation loop uses `requestAnimationFrame` and delta time. Frame delta is capped after interruptions; motion updates subdivide time into steps no larger than 1/120 second to support collision checks. Field physics and AI advance during motion and interception, while aiming leaves the user time to plan.

## Goal and goalkeeper proportions

The goal has a separate front opening, rear net, roof, and side panels. Its 200-unit opening projects to 58.24 units high, compared with a 40.7-unit standing goalkeeper: the opening is approximately 1.43 times the keeper's height. The keeper uses a wider ready stance and stands 16 units in front of the goal line. These are visual design proportions inspired by the [official New Star Soccer screenshots](https://apps.apple.com/us/app/new-star-soccer/id498973162), rather than a claim about that game's internal measurements.

`GOAL.height` defines the physical crossbar threshold, and the same `HEIGHT_PROJECTION` maps ball elevation and goal height onto the Canvas. Net depth is independent of opening height. Goalkeepers can reach below the crossbar, leaving space for a well-judged chip, while excessive loft can still go over the bar. The camera includes the raised crossbar and the stadium behind it on both desktop and compact screens.

Goal-line classification uses the grounded collision radius and distances to finite, round-ended frame segments. Airborne enlargement is a visual effect and does not enlarge the collider. A ball touching an upright or crossbar rebounds; a clear shot above or beside the frame continues out. Rounded corner checks avoid invisible rectangular collision areas. The keeper's reach is tested against the bottom of the ball, keeping saves and chips consistent with the visible flight.

## Flight playback and resolution

Shots use slower playback near the goal. Ball physics and AI receive the same scaled delta time, while interface timers use real time. A height meter and ground-shadow separation distinguish low shots from rising and dropping chips. Outcome banners use Canvas screen coordinates so their text stays readable independently of the world camera.

A resolved chance retains its physical outcome while a brief animation plays. Goals advance into the net, rebound from its rear and sides, and fall to the floor; net motion begins on impact. Saves draw the held ball over the keeper's hands. High and wide shots continue beyond the goal, and frame hits rebound toward the field. The result card appears after this action has been visible.

Ground shadows are rendered beneath players. Low balls use ground depth ordering, airborne balls are rendered over players, and balls above the goal render after the frame. A crossing marker highlights where a goal or miss happened. These presentation effects do not award goals independently of the goal-line collision check.

## Player and ball scale

Outfield players and the on-field ball share a world-space depth scale, from 1.1 near the goal to 1.6 in the foreground. At the same depth, a grounded ball's diameter is 23% of a standing outfield player's height. Airborne growth is capped at 18%, so loft does not turn the ball into an oversized foreground object. These are approximate visual proportions informed by the official screenshots linked above, not measurements of proprietary game internals.

The keeper retains the goal proportions described above. Player/ball ratios are independent of viewport size and device pixel ratio; the ball is not enlarged to enforce a minimum CSS size. Its outline and trail preserve visibility, while pointer input retains a separate generous hit area. The contact close-up remains large for accurate single-finger selection.

## Ball contact and possession

Possession, reception, and kick execution use the same foot-level ball position. The ball sits beside the right boot, and the aim preview begins at the same point as the actual kick. Goalkeeper reaction timing allows for this slightly longer shooting distance while keeping central shots saveable.

Drag distance sets kick power, and the opposite drag vector sets direction. The contact tap is normalized within the close-up ball. Its horizontal offset sets spin, its vertical offset changes loft, and edge or late contact affects accuracy or strength. Shot power scales upward launch as well as forward velocity, so full-power bottom contact can clear the bar rather than repeatedly arriving at crossbar height. Passing retains its gentler loft model.

The aim preview and live motion share the velocity and integration methods. The preview assumes central contact; the later contact tap can change the actual trajectory.

Passes use the same input and physics as shots. Teammates run toward the moving ball and receive it when close enough and below the receiving-height threshold. Possession then transfers to the receiver. Defenders can intercept or block before reception. The off-ball scenario uses a moving incoming pass and a tap-selected player destination.

## Lifecycle and storage

Event listeners are registered through a helper that records cleanup functions. `destroy()` removes listeners, disconnects the resize observer, cancels the animation frame, and closes the audio context.

Session statistics and outcomes are held in memory. The project has no backend or browser storage dependency.
