# Popcorn

- `src/game.ts` coordinates the simulation, Three.js renderer, UI and audio. Keep economy and progression in `src/sim/` and `src/content/`. `tsconfig.sim.json` enforces the DOM- and Node-free simulation boundary.
- Keep the finished desktop-first, Simplified Chinese game coherent across progression, visible feedback and offline earnings. Use `docs/GAME_DESIGN.md` and the latest phase in `docs/EXECUTION_PLAN.md` for design context.
- Save changes span `src/sim/save.ts` and `src/platform/saves.ts`. Preserve migration, checksum validation and backup recovery. Exercise the older fixture in `tests/fixtures/save-v4.txt` when changing compatibility. Keep QA hooks gated by `__QA__`.
- Node 24, `npm ci`, `npm run dev`. Use `npm run check` for types and unit tests, `npm run e2e` for browser flows, and `npm run budget` for rendering changes. Use `npm run e2e:prod` for release verification.
- `npm run build` subsets fonts and produces relative-path `dist/` for HTTP hosting. `.github/workflows/pages.yml` checks and deploys qualifying `main` changes to GitHub Pages. Markdown-only pushes are excluded.
