# Shopar Football

A gesture-driven football game built around five short highlights. Pull back to aim, choose your contact point, and watch your shot or pass unfold.

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

- Five playable scenarios: one on one, long shot, through ball, two against two, and an off-ball receive.
- Drag direction and distance control kick direction and power.
- A second tap sets the contact point, affecting actual curve and loft.
- Ball physics include height, spin, friction, collisions, saves, and out-of-play detection.
- Completed passes transfer control to the receiver, who can shoot or return the ball.
- Goalkeeper, defender, and teammate behavior supports each highlight.
- Responsive layouts, high-DPI Canvas rendering, and shared Pointer Events input for mouse and touch.
- Highlight restart, session statistics, performance rating, and optional synthesized audio.

## How to play

1. Select **Tap to Play**.
2. Choose **SHOOT** or **PASS** before aiming.
3. Drag backward from near the ball. The kick travels opposite your drag; a longer pull adds power.
4. Release to open the close-up ball, then tap your contact point:

| Contact point | Effect |
| --- | --- |
| Center | Straight kick |
| Left side | Rightward curve |
| Right side | Leftward curve |
| Below center | More loft |
| Above center | Lower flight |

You have six seconds to choose contact. If the window expires, the game executes a weaker, less accurate kick.

For a chip, tap moderately below center. Combining strong power with contact near the bottom edge adds much more loft and can send the shot over the bar.

For the off-ball highlight, tap a destination on the pitch. Your player moves automatically; reach the incoming pass before it gets away. After a teammate receives a pass, control transfers to that player.

Use **Restart** to retry the current highlight and reset its statistics. After five highlights, review your goals, completed passes, missed chances, and performance score. **Play Again** starts a fresh session. The sound button toggles audio.

During a kick, watch the ball separate from its ground shadow and use the height meter's **BAR** marker to judge its flight. Play slows near the goal. Goals continue into the net, saves end with the keeper holding the ball, and shots over the bar continue behind the goal. A green tick marks a successful crossing; frame hits rebound and are reported separately.

## Repository structure

```text
ShoparFootball/
├── index.html              # Browser entry point and game UI
├── src/
│   ├── css/
│   │   └── style.css       # Presentation and responsive layouts
│   └── js/
│       └── game.js         # Input, state, physics, AI, audio, and rendering
├── docs/
│   ├── ARCHITECTURE.md     # Runtime design and game systems
│   └── TESTING.md          # Validation commands and manual test scenarios
├── tests/
│   └── game.test.cjs       # Dependency-free gameplay regression tests
├── .editorconfig           # Shared editor conventions
├── .gitattributes          # Cross-platform line ending rules
├── .gitignore              # Local files and generated output
├── CONTRIBUTING.md         # Development workflow and contribution guidelines
└── README.md
```

## Mobile play

On phones and tablets, the arena fits the available screen height and respects display safe areas. Portrait mode keeps the action buttons and power meter below the pitch; short landscape screens place them alongside it. The camera frames the current opportunity so the players and goal remain readable.

On compact screens, action controls step aside while the ball is moving and return when possession is available. The outcome and next-highlight button use the expanded arena.

Use one finger to pull back from the ball. Full power needs a short, screen-relative drag. Release, then tap the enlarged contact ball. Rotating the device cancels an unfinished drag safely; start a new drag after the layout settles. No fullscreen permission, orientation lock, or app installation is needed.

## Development

Edit the source files and reload the browser. No installation or compilation is needed. Keep `index.html` at the root so direct-file use and static hosting continue to work.

If Node.js is available, check JavaScript syntax with:

```bash
node --check src/js/game.js
node --test tests/game.test.cjs
```

See [Architecture](docs/ARCHITECTURE.md) for the game systems, [Testing](docs/TESTING.md) for the validation checklist, and [Contributing](CONTRIBUTING.md) for the development workflow.

## Project status

This is a playable prototype focused on on-pitch interactions. Session statistics live in memory and reset when the page reloads. There is no career mode, account system, or persistent storage.

The initial gameplay was validated in Chrome using mouse input and emulated mobile touch. Physical-device testing is documented in the [testing guide](docs/TESTING.md).
