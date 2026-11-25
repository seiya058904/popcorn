import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../../src/content/achievements.ts';
import { DECOR } from '../../src/content/decor.ts';
import { EGG_IDS } from '../../src/content/props.ts';
import { CANNON } from '../../src/content/skills.ts';
import { TRACK_RUNGS } from '../../src/content/upgrades.ts';
import { BOT_PROFILES, runBot } from '../../src/sim/bots.ts';
import { SIM_STEP } from '../../src/sim/stepper.ts';
import type { Simulation } from '../../src/sim/simulation.ts';

/**
 * Every achievement can be had. A bot plays a whole run; what it cannot do by itself (poke machines,
 * find eggs, overfill the cannon, let kernels get away, come back after a while) is done by hand.
 */
describe('achievements', () => {
  // These need the scene or the player's own mistakes; a run played to win never gets them.
  const BY_HAND = ['poke-first', 'poke-100', 'egg-first', 'egg-all', 'cannon-oops', 'hopper-miss', 'offline'];

  let sim: Simulation | null = null;
  const report = runBot(BOT_PROFILES.find((profile) => profile.cannon === 'perfect')!, 14, (_seconds, played) => (sim = played));
  const run = sim as unknown as Simulation;
  run.checkAchievements();
  const byPlay = new Set(run.state.legacy.achievements);

  it('earns everything else just by playing a run to the end', () => {
    expect(report.finished).toBe(true);
    const missing = ACHIEVEMENTS.map((achievement) => achievement.id).filter((id) => !BY_HAND.includes(id) && !byPlay.has(id));
    expect(missing).toEqual([]);
  });

  it('counts the upgrade rows for the collection achievements', () => {
    // The rows replaced 120 single upgrades; these four count what the rows sell.
    expect(TRACK_RUNGS.get('decor')!.length).toBe(DECOR.length);
    expect(TRACK_RUNGS.get('line')!.some((rung) => rung.gold)).toBe(true);
    for (const id of ['upgrades-10', 'gold-tier', 'decor-first', 'decor-all']) expect(byPlay.has(id), id).toBe(true);
  });

  it('can earn the rest by hand, and keeps them all into the next run', () => {
    const s = run.state;
    for (let i = 0; i < 100; i += 1) run.poke(0);
    for (const id of EGG_IDS) run.findEgg(id);
    for (let i = 0; i < 3; i += 1) {
      s.cannonCooldown = 0;
      expect(run.fireCannon(CANNON.chargeSeconds + 0.1)?.result).toBe('overpressure');
    }
    expect(run.applyOffline(3600)).not.toBeNull();
    // The game checks every second; the run's own counters go with it on a restart.
    run.checkAchievements();
    // The finished run catches every kernel by itself; the next one starts without that.
    expect(run.restartRun()).toBe(true);
    let escaped = 0;
    for (let t = 0; t < 3 * 3600 && escaped < 5; t += SIM_STEP) {
      const before = run.state.stats.hoppersMissed;
      run.step(SIM_STEP);
      escaped += run.state.stats.hoppersMissed - before;
    }
    run.checkAchievements();
    const missing = ACHIEVEMENTS.map((achievement) => achievement.id).filter((id) => !run.state.legacy.achievements.includes(id));
    expect(missing).toEqual([]);
  });
});
