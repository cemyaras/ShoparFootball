# Incremental modularization

This roadmap preserves the seven current highlights, graphics, physics, controls, session statistics, and direct-file/static-hosting compatibility. Each stage must remain playable and independently reviewable. No new gameplay mechanics or build system are included.

## Current status

Stages **0–9 are complete**. Bootstrap now constructs the exported coordinator after all registrations, the obsolete adapter path is removed, and standalone registration/complete/retry is verified. The original seven highlights, gameplay, physics, controls, rendering, progression and offline/static hosting remain intact. No refactor stages remain pending; no gameplay features were added by this roadmap.

## Stages

| Stage | Status | Work | Acceptance |
| --- | --- | --- | --- |
| 0 | Complete | Read test runtime scripts from HTML and keep browser regression tooling in the repository. | All original 63 assertions/cases pass; the complete seven-highlight mouse/touch flow remains reproducible. |
| 1 | Complete | Extract AudioSystem mechanically. | Exact tone/envelope/toggle behavior, lazy context reuse, failure handling, and game teardown remain intact. |
| 2 | Complete | Extract constants/math/geometry, then physics in a separate change. | No coefficient, operation order, object identity, impact event, preview, or trajectory change. |
| 3 | Complete | Introduce highlight registry and move scenario definitions behind adapters. | Same seven entries/order; counts derive from registrations; keeper plan still applies to the five attacking highlights. |
| 4 | Complete | Extract session and outcome processing in separate changes. | Same result text, sound, effects, delays, statistics, rating, duplicate guards, and restart snapshots. |
| 5 | Complete | Introduce the shared context/controller contract, migrate Cut the Pass, then Win the Ball separately. | No controller DOM access or full FootballGame dependency; same timing, controls, and variant lifetime. |
| 6 | Complete | Extract viewport, DOM UI, then native pointer transport separately. | Same geometry/camera, capture/release/cancellation, pause, and resize behavior. |
| 7 | Complete | Move attack flow/AI, then Read the game through adapters. | Same AI/physics/collision order, shot/pass behavior, and reception-to-attack flow. |
| 8 | Complete | Complete actor pose data, then extract the Canvas renderer. | No controller-type checks in renderer; exact layering, transforms, sprites, goal/net/shadow/effect behavior. |
| 9 | Complete | Extract bootstrap, remove obsolete adapters, and finish docs. | Coordinator has no new-highlight branches; a test-only registration can enter, resolve, and retry without coordinator changes. |

## Module boundaries

- `core`: constants, math, geometry and actor creation.
- `audio`, `physics`: shared sound and simulation services; physics never writes DOM or plays audio.
- `viewport`, `input`, `ui`: coordinate mapping, native pointer lifecycle, and DOM presentation/dialogs.
- `session`: progression, practice, snapshots, outcome application, and rating.
- `renderer`: Canvas drawing in its existing order; keep it as one module initially.
- `highlights`: registry and attack/reception/tackle/pass-interception controllers.
- `environment`: keep its existing presentation/storage boundary.
- `game`, `bootstrap`: composition, frame loop, pause, and application lifecycle.

Use strict IIFEs, the `window.ShoparFootball` namespace, ordered relative classic `defer` scripts, and no imports/fetch/bundler. Keep the active `window.FootballEnvironment` compatibility export and `game.defense` inspection alias. Keep the `window.footballGame` facade, including methods used by regression tests; forwarding methods must retain the existing state rather than copies.

## Highlight contract

Definitions provide stable ID, title/category, initial actors, camera preferences, outcome descriptors, and `create(context)`. Controllers provide `enter`, `handleInput`, `cancelInput`, `update`, `updateResult`, presentation/actor-pose getters, world/overlay drawing hooks, and `dispose`. Unused hooks get neutral defaults.

Input carries type, pointer identity and world point; native events and capture remain in the transport. Controllers receive real frame delta and preserve their current playback scaling/substeps. Result animation owns its elapsed clock; the host advances the pending-result screen delay once. Presentation supplies hints, accessible text and camera/control visibility, while actor poses replace renderer knowledge of controller internals.

The bounded context exposes shared actor/ball and transient play references, phase/geometry/physics services, presentation feedback, sound/effects, per-highlight persistent memory, resolution/delay presentation, and `complete(outcomeId, detail)`. It must not expose DOM, the entire game, progression, or direct statistics writes. Outcome descriptors preserve existing IDs and map to success, stat changes, text, sound/effects and delay policy; completion is applied once. In particular, attacking `intercepted` is a failure and defensive `pass_won` is a success.

## Verification and progress

Run all original regression cases unchanged after every stage. Update only the loader when files move. Preserve runtime timing, seeded/random call order, actor/ball identity, pointer cleanup order, and result draw layers. Browser checks cover file and HTTP loading, touch/mouse, short landscape, seven highlights, restart, pause, and summary/replay. Generated screenshots stay in ignored `test-results/`.

Completed in the first batch: stages 0–1. The original 63 gameplay cases retain their assertions; three new audio compatibility cases bring the suite to 66 passing tests. The extracted audio class body was compared byte-for-byte with the original. The seven-highlight browser flow passed before extraction, after extraction on `file://`, and after extraction on HTTP under `/ShoparFootball/`, with no runtime exceptions. Actual sound-button enable/mute/re-enable, context reuse and game teardown also passed in Chrome at 1280 × 900. The mobile summary screenshot was reviewed.

Completed in the second batch: stage 2, in two sequentially checked steps. Core constants/math/geometry were extracted first, then the four physics services. Existing facade methods remain, and no gameplay assertions were changed. All 67 tests pass, including a new test loading core/physics without DOM, Canvas, audio or a game. A one-off comparison with the saved pre-extraction runtime found exact actor/ball/keeper/result/stat trajectories for 42 highlight runs at 30/60/120 FPS, plus identical sampled geometry. Physics method bodies match the originals except for qualifying the geometry provider. Native-touch seven-highlight flow, desktop mouse, summary/replay and rotation checks passed through both `file://` and HTTP under `/ShoparFootball/`, without runtime exceptions.

Completed in the third batch: stage 3. The original catalog fields and order are preserved in startup registrations with stable IDs. Temporary factories construct the existing defense objects and enter the existing post-intro phases. Menu entries, progress dots and PLAY ALL counts derive from registrations. Camera/run-marker metadata replaces numeric scenario checks, while keeper eligibility preserves the five-entry shuffle and its four random calls. All 71 tests pass, including startup extension, reordered entries, catalog compatibility and registry identity. A one-off comparison found identical traces for 42 before/after runs at 30/60/120 FPS. The file and HTTP-subdirectory browser flows passed all seven highlights, native touch, mouse, summary/replay and rotation/cancellation, with no runtime exceptions. Input/simulation/result/controller-context migrations remain for their later stages.

Completed in the fourth batch: stage 4.

- [x] **4a — Session:** a DOM-free owner for counters, outcomes, index/practice mode, keeper plan and checkpoints; existing game fields remain writable aliases. Progression decisions and rating are delegated without changing transition order. All 71 then-existing tests and 42 before/after trajectories passed before result extraction.
- [x] **4b — Results:** separate result application and summary presentation; catalog-referenced outcome descriptors retain titles, banners, flight labels, details, sounds, effects and base delays. Completion guards, defensive delay override, fallback behavior and physical resolution remain compatible. All 76 tests pass, including new session/alias/template/registered-outcome cases. A one-off comparison matched 192 before/after result presentations, counter changes, sounds, effects and delays exactly; the 42 trajectory comparisons also still match.
- [x] **Browser acceptance:** full seven-highlight native-touch flow, desktop mouse shooting, both defensive actions, summary/replay and rotation/cancellation passed on `file://` and HTTP under `/ShoparFootball/`, without runtime exceptions.

Completed in the fifth batch: stage 5.

- [x] **5a — Contract and Cut the Pass:** shared neutral hooks, an explicit bounded context, normalized pointer data and host-owned capture, controller presentation and poses. Cut the Pass migrated without a DOM or whole-game reference; all 76 then-existing cases and 42 trajectory comparisons passed before migrating the tackle.
- [x] **5b — Win the Ball:** hold/release, timing, lunge and stumble poses now use the same contract. Per-highlight memory preserves the three-variant lifetime across retries/new sessions. The `game.defense` inspection alias and helper methods remain available. The combined legacy `defense.js` was replaced by the two namespaced controller modules.
- [x] **Lifecycle and extensibility:** context deactivation/dispose on replacement and game teardown; stale completion cannot award a new attempt. A test-only controller registration handles input, cancellation, completion and disposal without coordinator changes. Original five attacking entries remain behind their adapters until stage 7.
- [x] **Acceptance:** all 83 tests pass; one-off comparisons preserve 42 numeric trajectories and 192 result presentations. Four success/failure defensive render sequences have identical Canvas commands/styles. The seven-highlight file and HTTP-subdirectory flows passed. Twelve real-time native mouse/touch success/failure checks passed across 1280 × 900, 390 × 844 and 568 × 320 with no runtime errors; a short-landscape result screenshot was reviewed.

Completed in the sixth batch: stage 6.

- [x] **6a — Viewport:** existing mapping, camera, DPR, compact mode and observer moved behind writable facade aliases. All 83 then-existing cases and 42 numeric trajectory comparisons passed before UI extraction.
- [x] **6b — DOM UI:** selectors, controls/dialogs, HUD/feedback and result/summary DOM writes moved to DomUI. Results sends presentation models; AudioSystem uses an injected UI notification instead of DOM access. The audio fixture injects the real DomUI sound renderer so its original assertions remain intact. All 83 then-existing tests and numeric trajectories passed before pointer extraction.
- [x] **6c — Pointer transport:** native listeners, single-pointer state, capture/release/cancel, blur and visibility handling moved to PointerInput. Existing kick/reception translation is unchanged and remains there until stage 7. The coordinator keeps forwarding methods and the common listener-removal ledger.
- [x] **Acceptance:** all 87 tests pass, including new DPR/inverse mapping, unchanged/changed-resize capture, all-dialog pause/close clocks, synchronous lost-capture and teardown checks, plus DOM-free audio fallback. One-off comparisons still match 42 trajectories, 192 result presentations and four Canvas render sequences. Full seven-highlight file and HTTP-subdirectory flows passed. The reusable platform runner passed 38 checks at 1280 × 900, 390 × 844 and 568 × 320, covering picker/dialogs/pause, sound UI/context reuse, native hold/cancellation, rotation and Escape. No runtime exceptions occurred. The test driver supplies Escape's virtual key code; application keyboard behavior was not changed.

Completed in the seventh batch: stage 7.

- [x] **7a — Shared attack:** contact/input translation, possession transfers, goalkeeper/defender/teammate AI, shot collision order and physical result playback moved into `AttackController`. The facade retains writable play-state aliases and inspection methods; controllers use bounded phase/presentation services and a session-owned reception event. All 87 then-existing tests, 42 numeric trajectories, 192 result presentations and four defensive render sequences passed before separating Read the game.
- [x] **7b — Reception:** incoming-pass setup/input/movement now lives in `ReceptionController`, which reuses the attack controller after a real reception. All seven catalog entries use `create(context)`. Native input delivers normalized gestures with final-release sampling and release-before-callback ordering, without scenario-specific gesture branches. The dormant legacy entry-adapter fallback remains for planned stage 9 cleanup.
- [x] **Acceptance:** all 91 tests pass, preserving existing assertions. Added headless attack/reception tests cover cancellation, invalid/late contact, delayed kick execution, AI-before-integration/goal-before-save ordering, net playback, actual reception and a missed incoming pass. Native-transport regression verifies inert intro/result screens and final release coordinates. Before/after checks match 42 trajectories at 30/60/120 FPS, 192 result presentations and 14 attack/reception/defense Canvas command/style sequences exactly.
- [x] **Browser acceptance:** full seven-highlight native-touch sessions, passes/return passes, reception, both defensive actions, result/summary/replay, rotation and desktop mouse passed on `file://` and HTTP under `/ShoparFootball/`. The platform runner passed all 38 checks at 1280 × 900, 390 × 844 and 568 × 320. No runtime exceptions occurred. The portrait reception screenshot was reviewed. Testing used headless Chrome and emulated touch; physical-device/normal-speed readability coverage remains as documented in TESTING.md.

Completed in the eighth batch: stage 8.

- [x] **8a — Pose and marker data:** shared pose composition now supplies controlled-player visibility, movement/stride, kick, celebration/hop, dive/held-ball and tackle presentation. Attack/reception controllers provide run-marker data. All 91 then-existing cases, 42 numeric traces, 192 result presentations and 14 Canvas sequences matched before renderer extraction.
- [x] **8b — Canvas renderer:** crowd initialization and all drawing moved into `CanvasRenderer`. A frozen explicit scene facade exposes live presentation references/services without a game, controller, session, DOM or native pointer. The coordinator still forwards render/draw/helper methods; internal drawing dispatch preserves inspection overrides. Existing layering/transforms and preview-on-a-copy behavior are unchanged.
- [x] **Acceptance:** all 95 tests pass, retaining earlier assertions. New headless checks cover rendering frozen scene objects, local-only preview integration, world/contact/screen layers, DPR/viewport transforms, pose composition and no simulation mutations during repeated renders of all seven highlights. One-off before/after comparisons preserve 42 trajectories, 192 result presentations, 14 animated drawing sequences and 6,768 Canvas command/style frames exactly across three viewports, all venues/forecasts and both motion preferences.
- [x] **Browser acceptance:** full seven-highlight native-touch sessions and desktop mouse passed on `file://` and HTTP under `/ShoparFootball/`, including pass/return pass, reception, both defenses, summary/replay and rotation. All 38 platform checks passed at 1280 × 900, 390 × 844 and 568 × 320. No runtime exceptions occurred. The desktop goal-result screenshot was reviewed. Headless Chrome/emulated touch and series-flight fast-forward limitations remain documented in TESTING.md.

Completed in the ninth batch: stage 9.

- [x] **9a — Bootstrap:** `game.js` exports `ShoparFootball.FootballGame` without DOM, startup effects or registry reads. The final `bootstrap.js` constructs `window.footballGame`; the constructor snapshots definitions for its UI, Session, Results and Viewport collaborators. All 95 then-existing cases, 42 trajectories, 192 result presentations and 14 Canvas sequences passed before adapter removal.
- [x] **9b — Cleanup:** removed `legacy-adapters.js`, its HTML dependency, the `createAdapter` execution path and `highlightAdapter` wrapper. Registration requires `create(context)`. Kept the existing inspection aliases/forwarders, active environment export, actor setup/random/call order, physics values and draw layers. Removed unused imports and stale extraction comments.
- [x] **Extension acceptance:** all 99 tests pass with existing gameplay assertions unchanged. New coverage verifies side-effect-free class loading, final-script construction, controller-only catalog validation, and a standalone definition registered after class loading. The added test enters, resolves success and failure through input, displays results, guards duplicate/stale completion, retries cleanly and disposes through the common lifecycle without coordinator changes. Production remains seven highlights.
- [x] **Regression acceptance:** one-off before/after comparisons preserve 42 trajectories at 30/60/120 FPS, 192 result presentations, 14 animated Canvas sequences and 6,768 Canvas command/style frames across the three viewports, all venues/forecasts and both motion preferences. Syntax/dependency checks and `git diff --check` pass. Full seven-highlight native-touch sessions and desktop mouse passed on `file://` and HTTP under `/ShoparFootball/`, with all 38 platform checks passing and no runtime exceptions. Headless Chrome/emulated touch and fast-forward limits remain documented in TESTING.md.
- [x] **Documentation:** completed README/module ownership/startup descriptions, added `docs/HIGHLIGHTS.md`, updated CONTRIBUTING and final AGENTS rules, and recorded the complete validation history.

All stages are complete. No commits, pushes, or deployments were performed.
