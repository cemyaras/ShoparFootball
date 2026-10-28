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

Gameplay uses a fixed 1000 × 740 world. The viewport computes a uniform scale and centering offset. Input uses the inverse transform, so mouse and touch positions map to the same world coordinates.

Canvas backing dimensions account for device pixel ratio, capped at three. CSS controls the visible dimensions. `ResizeObserver` and window resizing keep both mappings current.

The animation loop uses `requestAnimationFrame` and delta time. Frame delta is capped after interruptions; motion updates subdivide time into steps no larger than 1/120 second to support collision checks. Field physics and AI advance during motion and interception, while aiming leaves the user time to plan.

## Ball contact and possession

Drag distance sets kick power, and the opposite drag vector sets direction. The contact tap is normalized within the close-up ball. Its horizontal offset sets spin, its vertical offset changes loft, and edge or late contact affects accuracy or strength.

The aim preview and live motion share the velocity and integration methods. The preview assumes central contact; the later contact tap can change the actual trajectory.

Passes use the same input and physics as shots. Teammates run toward the moving ball and receive it when close enough and below the receiving-height threshold. Possession then transfers to the receiver. Defenders can intercept or block before reception. The off-ball scenario uses a moving incoming pass and a tap-selected player destination.

## Lifecycle and storage

Event listeners are registered through a helper that records cleanup functions. `destroy()` removes listeners, disconnects the resize observer, cancels the animation frame, and closes the audio context.

Session statistics and outcomes are held in memory. The project has no backend or browser storage dependency.
