import { spawnSync } from 'node:child_process';

/** Runs the production-build tests against `vite preview`. Expects a fresh `dist/`. */
const result = spawnSync('npx', ['playwright', 'test', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, E2E_TARGET: 'production' },
});
process.exit(result.status ?? 1);
