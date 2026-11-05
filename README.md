# Shopar Football

A gesture-driven football game built around ten short highlights and a complete Match Mode. Pull back to aim, choose your contact point, and watch your shot or pass unfold.

Built with HTML5 Canvas, vanilla JavaScript, and CSS. No framework, game engine, backend, external assets, or build step is required.

## Quick start

Open [`index.html`](index.html) in a modern browser. The game runs directly from disk and works offline.

For a local HTTP server, run this command from the repository root:

```bash
python3 -m http.server 8000
```

Open [localhost:8000](http://localhost:8000). Stop the server with `Ctrl+C`.

To try the game on a phone or tablet, connect it to the same local network as your computer and open `http://YOUR_COMPUTER_LOCAL_IP:8000`. Your computer's firewall may need to allow the connection.

## Features

- Ten playable scenarios: one on one, long shot, through ball, two against two, off-ball reception, **Win the Ball**, **Cut the Pass**, **Save the Penalty**, **Save the Shot**, and **Take the Penalty**.
- Drag direction and distance control kick direction and power.
- A second tap sets the contact point, affecting actual curve and loft.
- Ball physics include contact-dependent pace, airborne curve, diminishing bounces, rolling friction, collisions, saves, and out-of-play detection.
- Completed passes transfer control to the receiver, who can shoot or return the ball.
- Goalkeeper, defender, and teammate behavior supports each highlight.
- Two of the five attacking highlights feature a keeper off the line, leaving space for a soft chip. The other three keep a deeper goalkeeper; restarts preserve the position.
- A fixed diagonal 2.5D camera on every device, a deep goal with side and top nets, and block-style players, opponents and keepers.
- Responsive layouts, high-DPI Canvas rendering, and shared Pointer Events input for mouse and touch.
- Three selectable venues: a striped stadium, an asphalt street court, and a dirt ground.
- Sunny, cloudy, rainy, and snowy weather, with procedural lighting, puddles, and snowfall.
- Highlight restart, session statistics, performance rating, and optional synthesized audio.

## Match Mode

Choose **MATCH MODE** to play SFC against ROV, starting at 0–0. Six base positions alternate three attacks with Win the Ball, Cut the Pass and an open-play keeper save. Failed tackles or interceptions open one additional Save the Shot scene each, for six to eight playable scenes. Choose **CONTINUE** after a failed defense to control the keeper; the failure itself never awards a goal.

Only actual goals change the match score. Each position has one attempt; replay starts a fresh match after victory, draw or defeat. The counter tracks six base positions and labels keeper continuations separately. Switching to practice or Play All ends the current match.

A quarter of matches contain one penalty, equally likely for either team. It replaces one attack or the base keeper scene. Defensive failures always lead to open-play shots. There are no background goals, extra time or shoot-outs.

**Save the Shot** uses the same swipe controls as Save the Penalty, with a moving shooter and a longer flight. **Take the Penalty** uses the usual aiming/contact controls from the spot without outfield players.

## How to play

Use the weather icon in the top-right corner to open **Match settings**, choose your pitch/weather, and toggle sound. The match pauses while settings or **?** help is open. Choices carry across highlights and are remembered on this browser when local storage is available. The environments change the scene; shot physics and goal dimensions remain consistent.

1. Select **PLAY ALL 10** for a full session, or **CHOOSE HIGHLIGHT** to practise any one of the ten scenarios. Use **?** for the quick control guide.
2. Drag backward from near the ball. The kick travels opposite your drag; a longer pull adds power. Every kick uses the same controls and physics: aim at the goal to shoot or toward a teammate to combine.
3. Release to open the close-up ball, then tap your contact point:

| Contact point | Effect |
| --- | --- |
| Center | Straight kick with the most forward pace |
| Left side | Rightward curve |
| Right side | Leftward curve |
| Below center | More loft, less forward pace |
| Above center | Lower flight and progressively less power |

You have six seconds to choose contact. If the window expires, the game executes a weaker, less accurate kick.

Side contact adds airborne curve, which fades quickly after landing. Keepers take time to read direction changes and commit to their dives. Landings produce diminishing bounces, a brief ground ring, and a soft sound when audio is enabled.

For a chip, tap moderately below center. Combining strong power with contact near the bottom edge adds much more loft and can send the shot over the bar.

For the off-ball highlight, tap a destination on the pitch. Your player moves automatically; reach the incoming pass before it gets away. After a teammate receives a pass, control transfers to that player.

To test a particular scenario, open **CHOOSE HIGHLIGHT** and select its name. **Win the Ball** opens the defensive action immediately. In single-highlight practice, the result button is **RETRY**, which resets that same scenario and its statistics. Use the top-left chance counter or the result/summary selection button to switch highlights; closing the menu resumes the current attempt. **PLAY ALL 10** returns to the normal sequence with a fresh session.

For **Precision Pass** (practice-only Highlight #12), press on a teammate for a normal pass or pick open space for a through pass. Hold to charge power, then release to pass to the original spot. For a through pass, the nearest teammate runs into that space on release. Receivers must physically reach the ball, and defenders can step into reachable passing lanes. Power feedback stays above your finger on touchscreens.

For **Win the Ball**, hold anywhere on the pitch to chase the red opponent. Keep watching the ball: release your finger or mouse button when its ring turns green and says **RELEASE!**. Early or late release misses; holding through every opportunity or starting too late lets the opponent escape. Retries rotate through side, diagonal, and chase approaches with different dribble rhythms. Cancelled gestures stop pursuit safely without tackling. The highlight ends at the result screen, without a counterattack.

For **Cut the Pass**, tap a destination on the pitch to move blue into the lane between the two red players. The receiver keeps running and the passer releases the ball after a short preparation. Change your destination as needed; interception happens automatically when you reach the live ball. A successful interception ends the highlight and adds one to **BALL WON**, without starting an attack.

**Save the Penalty** puts you in goal. Watch the red kicker, then swipe anywhere toward the shot. Swipe horizontally for a low dive or diagonally upward for a high save. Your keeper commits as soon as the swipe is long enough. Stay still for a shot down the middle. Each attempt ends after one penalty, and successful stops appear as **SAVES** in the summary.

Use **↻** in the top-right corner to retry the current highlight and reset its statistics. After eight highlights, review your goals, completed passes, balls won, penalty saves, missed chances, and performance score. **PLAY AGAIN** starts a fresh session.

During a kick, watch the ball separate from its ground shadow and use the height meter's **BAR** marker to judge its flight. Play slows near the goal. Goals continue into the net, saves end with the keeper holding the ball, and shots over the bar continue into the open space behind the goal. The camera stays on the goal; high misses leave the frame naturally and the result follows shortly after. A green tick marks a successful crossing; frame hits rebound and are reported separately.

## Repository structure

```text
ShoparFootball/
├── index.html              # Browser entry point and game UI
├── src/
│   ├── css/
│   │   └── style.css       # Presentation and responsive layouts
│   └── js/
│       ├── core.js         # Shared constants, math, actor and ball geometry
│       ├── physics.js      # Ball physics, player movement, and goal-line classification
│       ├── audio.js        # Synthesized sound with an injected UI notification
│       ├── environment.js  # Venue palettes, scenery, weather, and preferences
│       ├── highlights/     # Registry, attack/reception/defensive controllers, and outcomes
│       ├── session.js      # Counters, checkpoints, progression, and rating
│       ├── results.js      # Outcome application and presentation models
│       ├── platform/       # Viewport mapping, DOM UI, and native pointer transport
│       ├── renderer.js     # Canvas drawing through a bounded presentation scene
│       ├── game.js         # Exported coordinator class and shared state
│       └── bootstrap.js    # Final application construction and inspection instance
├── docs/
│   ├── ARCHITECTURE.md     # Runtime design and game systems
│   ├── TESTING.md          # Validation commands and manual test scenarios
│   ├── HIGHLIGHTS.md       # Registering and validating a new highlight
│   └── REFACTOR.md         # Completed modularization stages and verification evidence
├── tests/
│   ├── bootstrap.test.cjs  # Side-effect-free class loading and final startup
│   ├── game.test.cjs       # Gameplay regression tests
│   ├── audio.test.cjs      # Audio lifecycle and tone compatibility
│   ├── attack.test.cjs     # Headless attack/reception and simulation ordering
│   ├── renderer.test.cjs   # Headless render purity, pose data, and draw layers
│   ├── physics.test.cjs    # Headless core/physics service boundary
│   ├── highlights.test.cjs # Registry identity, order, and catalog compatibility
│   ├── session.test.cjs    # Headless checkpoints, progression, and rating
│   ├── controllers.test.cjs # Headless controller lifecycle and defensive behavior
│   ├── helpers/            # Runtime loader shared with checks
│   └── browser/            # Optional Chrome mouse/touch regression flow
├── scripts/check.cjs      # Check all runtime JavaScript and entry-point dependencies
├── AGENTS.md              # Rules for incremental, compatible changes
├── .editorconfig           # Shared editor conventions
├── .gitattributes          # Cross-platform line ending rules
├── .gitignore              # Local files and generated output
├── CONTRIBUTING.md         # Development workflow and contribution guidelines
└── README.md
```

## Mobile play

The game fills the viewport on desktop, phones, and tablets, and respects display safe areas. A compact score and chance counter sit above the pitch, with no action-selection menu. A small power meter appears only while dragging. The camera frames the current opportunity so the players and goal remain readable. There are no page headings, side panels, or persistent instruction cards.

Kick directly from the ball; there are no separate shot and pass modes. Help and settings are available on demand; the outcome and next-highlight button appear over the arena. The Canvas keeps the same dimensions across gameplay phases, avoiding camera jumps when controls change.

Use one finger to pull back from the ball. Full power needs a short, screen-relative drag. Release, then tap the enlarged contact ball. Rotating the device cancels an unfinished drag safely; start a new drag after the layout settles. No fullscreen permission, orientation lock, or app installation is needed.

## Development

Edit the source files and reload the browser. No installation or compilation is needed. Keep `index.html` at the root so direct-file use and static hosting continue to work.

If Node.js is available, check JavaScript syntax with:

```bash
node scripts/check.cjs
node --test tests/*.test.cjs
```

The staged modularization roadmap and current progress are recorded in [Refactor](docs/REFACTOR.md). Extracted modules use the `window.ShoparFootball` namespace while the existing `window.footballGame` inspection surface remains available.

To add a scenario or controller, follow [Adding a highlight](docs/HIGHLIGHTS.md). Register it before `bootstrap.js`; the coordinator needs no scenario-specific edits.

See [Architecture](docs/ARCHITECTURE.md) for the game systems, [Testing](docs/TESTING.md) for the validation checklist, and [Contributing](CONTRIBUTING.md) for the development workflow.

## Project status

This is a playable prototype focused on on-pitch interactions. Session statistics live in memory and reset when the page reloads. Only pitch and weather preferences are stored locally. There is no career mode or account system.

The initial gameplay was validated in Chrome using mouse input and emulated mobile touch. Physical-device testing is documented in the [testing guide](docs/TESTING.md).
