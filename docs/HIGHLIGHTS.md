# Adding a highlight

The seven production highlights are startup registrations in `src/js/highlights/catalog.js`. A definition supplies actors, metadata, outcomes and `create(context)`. The menu, progress, practice/retry, summary and keeper plan derive from the instance's ordered definition snapshot. Add a definition and its controller without adding scenario branches to `game.js`, input, UI or rendering.

## Reuse an existing controller

This example reuses attacking controls, AI, physics, animations and results. It is documentation only; the production catalog still contains seven highlights.

```javascript
(() => {
  'use strict';
  const namespace = window.ShoparFootball;
  namespace.Highlights.register({
    id: 'training-shot',
    title: 'Training shot.',
    category: 'attack',
    keeperEligible: true,
    player: [500, 400],
    mates: [],
    defenders: [],
    outcomes: namespace.OutcomeDefinitions.attack,
    create: context => new namespace.AttackController(context)
  });
})();
```

Put a registration in the catalog, or in its own classic script with a relative `defer` tag in `index.html`. Its dependencies must load first, and the registration must run before `bootstrap.js`. Registering between `game.js` and `bootstrap.js` is supported: loading the class does not capture the registry or start a game. The constructor takes the snapshot when bootstrap creates `window.footballGame`; later registrations do not update an existing instance.

Use a unique stable ID, title, category, player coordinates, and both actor arrays even when empty. Optional description/intro/tip fields are used by existing attacking feedback. `keeperEligible` participates in the existing session shuffle. `runMarker: 'through'` and `cameraExtraX` reuse current attacking marker/camera behavior. Adding entries intentionally changes the registered count and rating denominator; the original seven entries keep their current behavior during refactors.

## Introduce a controller

Extend `ShoparFootball.Controllers.HighlightController`, or return a plain object from `create(context)`. Missing hooks receive neutral defaults. Factories run after actor setup and checkpoint capture, before the highlight intro. Keep constructor setup separate from active-time updates. `enter()` runs once after the intro on every attempt, including retry.

| Hook | Contract |
| --- | --- |
| `enter()` | Return optional `{ state, toast, duration }`, using an existing gameplay phase; the host applies it. |
| `handleInput(input)` | Consume normalized down/move/up with world `point`, pointer ID and captured `start` on move/up. Return `{ handled, capture }`. |
| `cancelInput(reason)` | Clear gesture activity after capture is released; cancellation must not attempt a tackle or kick. |
| `update(dt)` | Advance active play using real frame delta; apply scenario-specific substeps/playback scaling here. |
| `updateResult(dt, resolution)` | Animate the resolved action, advancing `resolution.elapsed` when used. The host advances the result-screen countdown once. |
| `getPresentation()` | Read-only hint, accessible label, help visibility, camera bounds/max scale and supported run-marker data. |
| `getActorPose(actor)` | Read-only moving/kicking/tackling/stumbling activity and lean. Shared pose composition adds control, stride, celebration and keeper presentation. |
| `drawWorld(c)` / `drawOverlay(c)` | Pure optional drawing in world/screen coordinates at the existing highlight layers during DEFENDING. |
| `dispose()` | Release controller-owned resources when the attempt is replaced or the game is destroyed. |

Input owns native events and capture. Return `updateOnRelease: true` when the final release position must be sampled as a move before the up hook; aiming already does this. Return `dismissToast: false` when a handled press should retain its entry toast. No virtual joystick, native listeners or DOM references belong in a controller. The coordinator dispatches the existing AIMING, BALL_CONTACT, BALL_IN_MOTION, INTERCEPTION and DEFENDING phases; new independent simulations can use DEFENDING without changing the coordinator.

The frozen context supplies shared actors/ball, transient play state, persistent `memory`, live view/time/phase/resolution, physics/geometry, audio/effects, presentation requests and completion. Keep statistics and progression with Session/Results. `possessionReceived(offBall)` records a completed pass/reception through the session. Persistent memory is keyed by definition ID and survives retries and new series; keep per-attempt clocks and targets on the new controller instance.

Call `context.complete(outcomeId, detail)` when actual input/simulation resolves the attempt. The definition's outcome descriptors supply success, counter, title/banner/flight text, sound/effect and delay policy. Reuse `OutcomeDefinitions.attack`, `.tackle` or `.cutPass`, or provide custom keys with the same descriptor shape. Supported counter names are `goals`, `passes`, `misses`, `receives` and `tackles`. Descriptor banners are templates; Results copies them before animation. Defensive entries retain the current 1.3-second result delay and controller-provided detail. Completion is guarded against duplicate awards, and disposed attempt scopes cannot complete a later attempt.

Use [AttackController](../src/js/highlights/attack.js) for shared possession flow, [ReceptionController](../src/js/highlights/reception.js) for an entry phase that hands over to attacking possession, and the two defensive controllers for standalone timing/movement examples. The full boundary is described in [Architecture](ARCHITECTURE.md).

## Verify the addition

Run the checks in [Testing](TESTING.md), including native mouse/touch for input changes. Cover meaningful success and failure, cancellation, dialog pause, restart/practice retry, stale completion, statistics and final-summary progression. Keep the existing seven-highlight assertions intact.

The standalone-registration case in [game.test.cjs](../tests/game.test.cjs) registers a fresh definition after class loading, then enters, wins, loses, shows results and retries through the normal lifecycle. It uses no existing definition or coordinator changes. [bootstrap.test.cjs](../tests/bootstrap.test.cjs) verifies side-effect-free class loading and final-script startup. These test entries never enter the production catalog.
