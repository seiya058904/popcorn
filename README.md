# Pop! The Popcorn Got Out of Hand (砰！爆米花失控了)

A browser incremental game that leans toward idle play. You start with one kernel in a pot on the stove, buy ten generations of ever larger machines, and watch the heap outgrow the kitchen, the cinema, the town and the planet until the moon itself goes off. A first run takes about 2.5 hours, and totals climb past 100 quadrillion.

The game is web only. There is no desktop build. All text in the game is Simplified Chinese.

## Run it

You need [Node.js 24](https://nodejs.org/) and a current desktop browser with WebGL 2 and hardware acceleration turned on.

```bash
npm ci
npm run build
npm run preview
```

Open the address that `preview` prints, normally <http://localhost:4173/>.

For development with hot reload, use `npm run dev` instead.

### Hosting

`npm run build` writes a static site to `dist/`. Asset paths are relative, so it can be served from any folder of any static web server. It has to be served over HTTP or HTTPS, because browsers do not load JavaScript modules from `file://`.

## How to play

| Input | Action |
|---|---|
| Click the pot or the heap | Pop kernels |
| Hold the mouse button on the pot or the heap | Keep popping |
| Hold <kbd>Space</kbd> or the pressure gauge, then release in the green zone | Fire the cannon |
| Click the bouncing orange kernel | Start a frenzy |
| <kbd>Esc</kbd> | Pause menu, settings and save management |

Buy machines, flavors and upgrades from the panel on the right. Filling each stage bursts it open and carries the game into the next, larger scene. Clicking speeds things up but is never required: upgrades can stir the pot, fire the cannon and catch the hopping kernel for you.

## Saves

- The game saves automatically every 30 seconds and whenever the page is hidden or closed.
- Saves live in IndexedDB. If that is blocked the game falls back to `localStorage`, then to memory for the current session.
- A backup copy is kept, and a damaged save is restored from it.
- The pause menu can export a save as text and import it in another browser.
- Time away earns a capped share of normal production. Moving the system clock backward earns nothing.
- Saves from before the ten-machine economy start a new run. Achievements, the flavor album and new-pot progress are kept.

## Settings

Master, music and effects volume, graphics quality (automatic or four fixed tiers), show speed, reduced camera motion and screen shake. The system's reduced-motion preference is honored on first launch.

## Development

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run check` | Type checks and unit tests |
| `npm run e2e` | End-to-end tests in Chromium and Firefox, plus Chrome and Edge when installed |
| `npm run e2e:prod` | Build, then test the production site |
| `npm run balance` | Economy simulation, written to `docs/BALANCE.md` |
| `npm run audio` | Loudness and clipping checks for the generated audio (needs `ffmpeg`) |
| `npm run shots` | Review screenshots; add `--verify` to check they are reproducible |
| `npm run turntable` | Close-ups of every machine from four sides |
| `npm run playthrough` | Plays the real game with a simulated player |
| `npm run soak` | Real-time stress run with memory tracking |

The first end-to-end run needs browsers: `npx playwright install chromium firefox`.

```text
src/sim, src/content, src/events   Game rules and data, with no browser dependencies
src/render                         Three.js scenes, materials, popcorn and post-processing
src/audio                          Procedural sound and music
src/ui, src/platform               Interface, saves and settings
src/debug                          QA tools, removed from production builds
tools, tests                       Verification tooling and tests
docs                               Design, plan, balance report and credits
```

## Known limitations

- Edge has not been tested, because it was not installed on the development machine. Chromium and Chrome pass, and Edge shares their engine.
- Performance was measured on one desktop with a Radeon RX 7900 XT. Integrated graphics and laptops have not been tested on real hardware.
- The game is designed for desktop screens with a mouse. Phones and tablets are not a supported target.
- A breakout can take one long frame, up to about 420 ms on the development machine, while a later scene is prepared. It is placed inside the blast's white flash and hit-stop.
- Glass reflects and tints but does not bend what is behind it.
- Game feel, sound quality and art direction have been checked with frame captures and loudness analysis, not yet by human players.
- Pacing was tuned with simulated players: about 2.5 hours for an active player and about 3.1 hours for one who never clicks. Time for human players has not been measured.
- Simplified Chinese is the only language. The settings menu has a language option, but interface text still lives in `src/ui` and has to be extracted before another language can be added.

## Credits

All models, textures, shaders, music and sound effects are generated by the game's own code. Fonts and libraries are listed in [docs/CREDITS.md](docs/CREDITS.md).
