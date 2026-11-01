# Architecture

## Runtime

`index.html` provides a viewport-sized arena, floating HUD and gesture input, overlays, and native settings/help dialogs. It loads `src/css/style.css` and defers `src/js/core.js`, `src/js/physics.js`, `src/js/audio.js`, `src/js/environment.js`, the shared controller contract and attack/reception/defensive controllers, the highlight registry, outcome definitions and catalog, `src/js/session.js`, `src/js/results.js`, the viewport/UI/input platform modules, `src/js/renderer.js`, `src/js/game.js`, and finally `src/js/bootstrap.js` until the document has been parsed.

The JavaScript uses a strict-mode closure to keep implementation details scoped. `game.js` exports `ShoparFootball.FootballGame` without starting the application. The final bootstrap constructs the instance available as `window.footballGame` for inspection. The script stays compatible with direct `file://` loading; it does not require module imports, network requests, or a bundler.

## Systems

| System | Responsibility |
| --- | --- |
| Scenario definitions | Initial positions, descriptions, and coaching tips for all eight highlights. |
| State machine | Valid interaction phases, overlay visibility, and progression through a session. |
| Input | Pointer capture, drag direction and power, contact selection, cancellation, and interception destinations. |
| Physics | Kick velocity, spin, height, friction, collisions, goal-line crossing, and out-of-play checks. |
| AI | Delayed goalkeeper reactions, limited movement and dives, defender pressure, and teammate receiving runs. |
| Rendering | Procedural pitch, players, ball, trajectory preview, trails, contact close-up, and celebrations. |
| Environment | Venue scenery, surface texture, weather lighting/particles, and local preferences. |
| Defense | Hold-to-chase input, moving possession, release-to-tackle timing, and defensive result animation. |
| Audio | Optional tones synthesized through the Web Audio API without external audio assets. |

`FootballGame` coordinates lifecycle, actors, shared effects and the frame clock. `CanvasRenderer` owns procedural drawing behind a bounded presentation scene. Highlight controllers own interaction and simulation; the shared transient `play` model retains writable facade aliases for inspection. `Session` owns progression, practice mode, statistics, outcomes, keeper plan and restart checkpoints; the original FootballGame fields are writable aliases to that single state. `AudioSystem` now lives in `audio.js` as `window.ShoparFootball.AudioSystem`; it notifies an injected state-change callback, with sound-button DOM updates owned by DomUI. The callback defaults to a no-op for standalone audio use. The active `window.FootballEnvironment` compatibility export is retained. Rendering reads gameplay state; simulation changes happen in the update and interaction methods.

## State transitions

| State | Behavior and exits |
| --- | --- |
| `TITLE` | Waits for play, then enters `HIGHLIGHT_INTRO`. |
| `HIGHLIGHT_INTRO` | Sets up the highlight, then enters `AIMING`, `INTERCEPTION`, or `DEFENDING`. |
| `AIMING` | Pauses field simulation while the user aims and drags; a committed aim enters `BALL_CONTACT`. |
| `BALL_CONTACT` | Waits for contact or a six-second timeout, then enters `BALL_IN_MOTION`. |
| `BALL_IN_MOTION` | Advances physics and AI. A completed pass returns to `AIMING`; a resolved chance leads to `RESULT`. |
| `INTERCEPTION` | Moves an incoming pass and lets the user choose a player destination. Receiving enters `AIMING`; losing the chance leads to `RESULT`. |
| `DEFENDING` | Runs either the hold/release tackle or tap-to-position pass interception. Resolution leads to `RESULT`. |
| `RESULT` | Offers the next highlight, or `SESSION_SUMMARY` after the eighth. |
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

The arena occupies the viewport with no document-style header, sidebar, or footer. Score and eight-chance progress form a small top HUD. There is no kick-selection dock. A non-interactive power track appears near the bottom only while dragging. Settings contain venue, weather, and sound; the question-mark button opens a short control guide. Instructions are available on demand instead of remaining around the pitch. Scenario names and exposed-keeper warnings appear briefly as toasts. Detailed result/flight announcements remain available to assistive technology, while the visible UI emphasizes the ball, outcome, and next action.

## Win the Ball

`ShoparFootball.WinBallController` encapsulates the sixth highlight and reuses the existing player objects, `movePlayer`, Pointer Events, Canvas transform, sprites, audio, banners, and result/summary flow. The `DEFENDING` state has planning, running, and resolved phases. It uses a stable camera focused on the two participants. No attacking physics or input rules change in the original five highlights.

Red starts in possession and dribbles continuously. A primary pointer held anywhere on the pitch moves blue toward the exposed side of the moving opponent. Release immediately evaluates the visible opportunity and locks the result before the tackle animation. Movement of the held pointer does not steer; secondary pointers do not interfere. Cancellation, rotation, blur, and opening a dialog stop pursuit without attempting a tackle. Restart releases capture before rebuilding the highlight. Settings/help/selection pause movement and the defensive clock.

Each new defensive attempt rotates through side, diagonal, and chase placements, with different running speeds, dribble periods (1.25–1.55 seconds), and initial phases. The ball moves farther from the red player's foot during each exposed phase. The ring is drawn around the actual ball, with HOLD TO CHASE, HOLD…, and RELEASE! prompts. Green requires a ball distance of at most 43 world units, a side/front position, and the exposed part of the dribble. A cycle is admitted only when at least 420 ms remain, avoiding a fleeting green on late arrival. Release outside green produces `missed_tackle`; no input, late pursuit, or holding until the 7.2-second deadline produces `opponent_escaped`. A successful release produces `ball_won` immediately, then transfers the ball in the existing lunge animation.

A successful tackle lunges the blue sprite toward the ball, extends a leg, and transfers the ball to its boot. Failure leaves red in possession and moving away. `ball_won` counts as a successful highlight and increments `stats.tackles`, without incrementing goals or starting a counterattack. The summary exposes **BALL WON** and rates the eight-highlight session with equal success weight per goal, ball win or penalty save, up to nine pass points, and seven for off-ball reception (capped at 100).

## Direct highlight selection

The picker is populated from the ordered highlight registry snapshot and opens from the title, chance counter, results, or summary. It pauses the same simulation/timers as settings and help; closing it preserves the current attempt. `practiceIndex` is null for the full eight-highlight sequence, or the chosen scenario index for single-highlight practice. Starting a selection resets session statistics and transient state through the existing highlight setup. Practice results use **RETRY**, which calls the existing restart path instead of advancing or opening the summary. **PLAY ALL 8** clears practice mode and begins the original sequence at highlight one.

## Cut the Pass

`ShoparFootball.CutPassController` in `highlights/cut-pass.js` uses the existing DEFENDING lifecycle, actor sprites, `movePlayer`, `integrateBall`, trail/ripple effects, input transforms, dialog pause, practice/restart, and result flow. It is the seventh independent highlight. Two red players are passer and receiver; blue starts away from their lane. Tap destinations move blue at a bounded speed and can be revised, including during flight. No tackle input or counterattack follows.

The receiver runs from the start. After 2.8 seconds, the passer aims a ground pass ahead of the receiver with the shared rolling physics. Position is tested using swept relative ball/player motion in steps of at most 1/120 second, so selecting a correct destination is insufficient if blue arrives late. A real blue contact produces `pass_won`; the receiver collecting the ball, the pass getting beyond them, or a 6.2-second safety timeout produces `pass_through`. The result animates the ball settling at the actual winner's foot. Both defensive successes increment `stats.tackles` and the existing BALL WON summary; goals are unaffected. The rating grants 84 divided by the registered count per successful highlight plus existing pass/receive bonuses, capped at 100.

## Modularization status

See [the staged roadmap](REFACTOR.md). Stages 0–9 are complete. `ShoparFootball.Core` owns world constants, math, actor creation and geometry; `ShoparFootball.Physics` owns kick velocity, integration, player movement and goal-line classification. `AttackController` now owns attacking gestures/contact, possession transfers, goalkeeper/defender/teammate AI, ordered shot collisions and physical result playback. `ReceptionController` specializes incoming-pass setup, positioning and interception, then reuses the shared attack flow after reception. All eight catalog entries use the bounded controller context. Viewport, DOM UI, native input, audio, session and outcome processing have separate modules. FootballGame retains compatible inspection methods and writable play/session/viewport aliases. `CanvasRenderer` owns drawing, and the shared controller presentation layer supplies complete actor poses and run markers. `bootstrap.js` owns final startup, and the obsolete entry-adapter script/path has been removed. Tests read classic scripts from `index.html` in document order, and the syntax checker validates all runtime files and entry-point dependencies.

## Highlight startup registry

`ShoparFootball.HighlightRegistry` stores definitions by stable ID and insertion order; `ShoparFootball.Highlights` is the startup instance. `all()` returns a list snapshot without cloning actor definitions. Load the registry and catalog after their controller/outcome dependencies, before bootstrap. The class constructor takes the ordered snapshot for that instance, so registrations can also run after `game.js` exports the class and before `bootstrap.js` constructs it. Existing instances keep their snapshot; hot registration does not update a running series.

The catalog retains the original titles, actor coordinates, tips, and order. Its stable IDs are `one-on-one`, `from-distance`, `through-ball`, `two-against-two`, `read-the-game`, `win-the-ball`, `cut-the-pass`, and `save-the-penalty`. Definitions add category, keeper eligibility, controller factory, and optional camera/run-marker metadata. Menu entries, progress dots, PLAY ALL labels, progression limits and rating denominator use the registered count. The eight-entry fallback HTML remains readable before startup.

`create(context)` is the only supported controller factory. Adapter-only definitions are rejected at registration; the old entry-adapter implementation and coordinator wrapper have been removed. Factories receive a bounded context after actor setup and before the intro, preserving constructor setup timing. `game.defense` remains an inspection alias for defensive controllers, while host dispatch uses the shared controller hooks. No second controller implementation is introduced.

Reception camera bounds and the through-ball run marker use definition metadata instead of numeric indices. Keeper shuffling selects only `keeperEligible` entries, still makes four random draws for the five existing attacking highlights, and maps those profiles back to their registered positions. Defense entries retain the near-line fallback. This preserves the two-advanced/three-line plan without tying eligibility to the first five array slots.

## Session and result ownership

`ShoparFootball.Session` is DOM-free. It owns `index`, `practiceIndex`, `stats`, `outcomes`, `keeperPlan` and `scenarioSnapshot`. FootballGame forwards the legacy fields with getters/setters and keeps `createKeeperPlan`, `restart`, `nextHighlight`, `finish` and `showSummary` compatible. Checkpoint restore replaces current-highlight counters with a copy while preserving earlier outcomes and keeper layout; begin creates fresh counters and performs the same keeper shuffle. `advance()` returns next/retry/summary, leaving actor setup and phase transitions in the coordinator. Rating uses the same success weight, bonuses and cap.

`ShoparFootball.Results` applies a result once, creates the existing resolution snapshot, updates shared session counters, triggers the same audio/effects, and prepares the result/summary presentation. Physical result animation and viewport exit detection run in the active controller; FootballGame advances the pending-result countdown once per real-time frame after that hook. Results sends view models to DomUI and has no DOM selectors or writes; its coordinator reference remains an application-level dependency, separate from the bounded controller context.

`highlights/outcomes.js` supplies descriptor groups referenced by the catalog: attack, tackle and defensive pass interception. Each descriptor provides success, counter to increment, title/banner/flight text, optional detail, sound/effect profile and base result delay. Chip variants are evaluated with the existing keeper-clearance flag. Defensive highlights still override the screen delay to 1.3 seconds. Descriptor banners are copied before their countdown is mutated. The shared outcome lookup and unknown-outcome fallback preserve existing direct `finish` calls; registered definitions can override a result without coordinator branches. Attacking `intercepted` remains a miss, while `pass_won` remains a ball win. Result descriptors do not implement physics or controls.

## Controller and context contract

`highlights/controller.js` provides the shared `HighlightController` defaults and normalization for plain controller objects. `enter()` returns optional `{ state, toast, duration }` for the host to apply after the intro. `handleInput({ type, point, start, pointerId })` receives down/move/up and world-space points, with the captured start point on move/up. Its reply carries `{ handled, capture }` and optional `updateOnRelease`/`dismissToast` flags. Aiming requests a final move sample before release; other gestures retain their existing release behavior. PointerInput owns native Pointer Events and capture/release/cancellation; the coordinator keeps forwarding methods for compatibility. Pointer release occurs before the up hook; cancellation releases capture before `cancelInput('cancel')`. No native event enters a controller.

The remaining hooks are `update(dt)`, `updateResult(dt, resolution)`, `getPresentation()`, `getActorPose(actor)`, `drawWorld(c)`, `drawOverlay(c)`, and `dispose()`. Neutral defaults make unused hooks safe. Update delta is real frame time; controllers retain their original substeps and own resolution elapsed updates. The common host advances the pending-result delay exactly once. Presentation carries accessible text, hint, help visibility, camera settings and run-marker data. Controller activity poses supply moving/kicking/tackling/stumbling flags and lean. The pure shared `Controllers.actorPose(context, actor, activity)` composer adds controlled-player visibility, running stride, kick, celebration/hop, keeper dive/angle and held-ball presentation with the original precedence. `game.actorPose(actor)` forwards this complete pose to rendering, which never inspects controller fields or derives behavior from scenario IDs. Drawing hooks run at the original world/screen layers.

The context is an explicit frozen object with shared player/ball/keeper/defender/mate references, the transient `play` model, live view/time/reduced-motion getters, per-definition memory, physics/geometry services, audio, effect buffers and `complete(kind, detail)`. It also provides run-marker metadata and a live resolution getter for presentation, a bounded phase transition/elapsed-time service, presentation requests for power/contact/flight/toasts, pending-result delay access for landing/exit feedback, and `possessionReceived(offBall)` for the session to record a completed pass or reception. Controllers cannot write session statistics directly. Host-mutating phase/feedback/completion services are deactivated with the controller scope. It has no game, DOM, statistics, session, native pointer or progression reference. Completion releases a held pointer before forwarding to the guarded result service. The scope is deactivated before a controller is replaced or destroyed, preventing stale controllers from awarding a later attempt. Dispose then releases any controller-owned resources.

`Session.memoryFor(id)` persists per-highlight variant memory across retries and new series, matching the former Win the Ball counter lifetime. `game.defenseVariant` remains a writable compatibility alias for the original highlight's variant index. `game.defense` and existing inspection helpers such as timing, beginHold and selectTarget remain available. The old unnamespaced defensive constructors and combined `defense.js` file have been replaced by the two namespaced controller modules; all runtime loads use the HTML entry point.

## Platform modules

`platform/viewport.js` owns view, compact mode, DPR and ResizeObserver state. It applies the unchanged camera bounds, HUD/drag margins, maximum controller scale, DPR cap, resize thresholds, inverse coordinate mapping, drag range and contact geometry. Its window/visualViewport listeners and observer invoke the compatible resize facade; mapping changes cancel capture before replacing the transform. FootballGame view/compact/dpr/resizeObserver fields are writable aliases, so controllers continue to see the live view.

`platform/ui.js` owns selectors, body classes, button/menu/dialog events, radio preferences, HUD, power/contact/toast/flight feedback and result/summary DOM presentation. Results prepares a view model and UI renders it. AudioSystem accepts `onStateChange(enabled)`; the application injects DomUI's sound-control update. UI queries dialog pause state; the original host update loop still owns clock advancement and result delays. UI is a host presentation adapter, not a second simulation/state owner.

`platform/input.js` owns the single active pointer, native canvas listeners, capture/release/cancel, blur and visibility handling. All highlight gestures are delivered as normalized data through the same controller hooks; input has no shot, contact, reception or defensive gesture branches. The common active-phase guard preserves inert intro/result/summary screens. Capture is cleared before native release and before the up/cancel hook; a requested final move sample uses the release position first. FootballGame pointer and native-event methods forward to this module. All platform event removers still register through the common listen/dispose ledger, preserving binding and teardown order. No listeners are added per highlight; teardown releases capture and removes handlers before disconnecting the viewport observer and closing audio.


## Attacking controllers

`highlights/attack.js` implements the first four highlights and the possession phase shared by Read the game. `highlights/reception.js` subclasses it only for incoming-pass entry, tap destinations and interception movement. On reception, the same controller immediately changes to AIMING, transfers control and ball placement, clears the previous flight/contact/aim, records the reception through Session, and uses the shared kick flow. No coordinator scenario branch is required.

AI still runs before integration; goal-line crossing is evaluated before out-of-play, keeper, defender, teammate and weak-shot checks. Each simulated flight frame retains its original near-goal speed scaling and at-most-1/120-second outer steps, with the existing Physics inner steps unchanged. Contact timers and result-screen countdowns use real time. Controllers own the resolution elapsed clock and preserve save attachment, net damping, bounce feedback, airborne-miss landing/viewport-exit delays and trail aging. The host advances the screen countdown only after controller playback.

The `play` model holds controlled/kicking actors, aim/kick/contact, flight/motion clock and incoming-pass targets. FootballGame exposes the previous field names as writable aliases and forwards chooseContact, executeKick, receive, keeper/AI/motion/interception and resolution inspection methods. The attack controller supplies receiver markers during AIMING, while reception supplies incoming-pass and destination-route data during INTERCEPTION. These are read-only presentation queries; no drawing function decides which teammate to mark.


## Canvas renderer

`src/js/renderer.js` exports `ShoparFootball.CanvasRenderer`. It owns crowd initialization and all Canvas routines: pitch/surroundings, goal/net, run markers, sprites, ball/shadows/trails, aim preview, possession/contact feedback and screen-space banners. It uses one module to preserve the established draw order. Renderer construction and drawing require no DOM, native input, session or controller instance. The environment remains the existing presentation collaborator.

`CanvasRenderer.createScene(game)` is an application bridge that creates a frozen presentation facade with explicitly listed live getters. It shares the current actor/ball/effect/view/context references and exposes geometry, local-preview physics, actor poses, presentation markers and world/overlay callbacks. The renderer receives the facade rather than FootballGame. Scene queries and drawing do not advance clocks, update actors, emit sounds, add effects or change counters. Aim prediction integrates only a copied ball. The host keeps the existing activation rule for world/overlay hooks.

FootballGame retains render/draw/polygon/ballAboveGoal/initCrowd forwarding methods. Drawing dispatch passes through those facade methods so existing inspection overrides, including goal/ball layer assertions, still intercept real rendering. Replacing `game.ctx` or `game.view` remains immediately visible through live scene getters. The renderer stores no copied simulation state.

The layer sequence remains DPR reset/background → world transform/shake → pitch, goal back and run markers → highlight world hook → aim/trail/shadows and depth-sorted actors/ball → goal foreground/above-goal ball/crossing marker → ripples/particles/weather → possession/contact/flash → restore world transform → highlight screen hook → outcome banner. Keeper saves, goal roof redraw, above-bar balls and ball-to-player depth tests keep their original ordering.


## Bootstrap and extension

`game.js` defines and exports `ShoparFootball.FootballGame`. Loading that file does not read the registry, query DOM, bind listeners, create audio/actors or schedule a frame. `bootstrap.js`, the final relative classic deferred script, constructs one game and publishes `window.footballGame`. The constructor retains the original composition/setup order and captures `Highlights.all()` as `game.definitions`, shared by UI, Session, Results and Viewport. Registrations complete before that construction.

The coordinator creates every attempt through the same `create(context)`/normalize/enter/update/result/dispose lifecycle. It contains no scenario-ID or numeric-index dispatch. The `category` metadata retains defensive inspection/result styling; keeper eligibility, camera extras, run markers and outcomes come from definitions. The `game.defense` alias and all tested inspection/forwarding fields remain available. Replacing an attempt deactivates the previous scope before disposal; teardown cancels capture, deactivates/disposes, removes listeners, disconnects viewport observation and stops frame/audio resources in the existing order.

See [Adding a highlight](HIGHLIGHTS.md) for a complete registration example, hook contracts and validation. A test-only standalone definition registered after class loading enters, resolves success/failure, shows results and retries through this lifecycle without coordinator edits. It is excluded from the production catalog.


## Save the Penalty

The eighth entry uses `PenaltySaveController` in the existing DEFENDING lifecycle. Red takes a preselected penalty while the controlled keeper accepts one committed swipe. The initial shot is a readable low-left attempt, followed by five cycling shot profiles covering both sides, low/high contact, central placement and firmer pace. Run-up lasts two real seconds. Shared ball integration and keeper movement use the same .4 playback scale, with simulation steps at most 1/240 second. Shot flight lasts approximately .6–.8 real seconds. A late run-up cue matches the preselected direction and height.

A swipe commits after 18 CSS pixels, before release. Horizontal swipes dive low and upward diagonal swipes jump higher. Native capture, cancellation, resize and modal pause use the platform transport. A small or cancelled gesture leaves the keeper ready. Once a dive commits its direction and height remain fixed. Actor presentation hides the unused outfield player, identifies the controlled keeper and supplies body elevation, roll and explicit local glove centres. The renderer draws those centres and the controller transforms them into physical contact positions. Swept contact compares relative ball/glove motion in lateral, depth and projected height coordinates. Torso contact can stop central balls. Goal-line crossing clips the contact segment so a later reach cannot undo a goal.

`penalty_saved` increments the separate `saves` counter and attaches the ball smoothly to the glove. `penalty_conceded` increments misses and advances the ball into the net. Both use existing result/retry flow. Session snapshots restore saves on retry, and summary/rating include successful saves with the same weight as goals and ball wins. The five original attacking entries retain their keeper plan and physics.
