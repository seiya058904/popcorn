import { CANNON } from '../content/skills.ts';
import { cannonGreenRange, cannonStreakBonus } from '../sim/economy.ts';
import type { Simulation } from '../sim/simulation.ts';
import { el, setClass, Text } from './dom.ts';
import { MOTION, play } from './motion.ts';

const STREAK_STARS = 5;
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 16.8l-5.8 3.3 1.4-6.4-4.9-4.4 6.5-.7z"/></svg>';

const START_ANGLE = -125;
const SWEEP = 250;
const CENTER = 100;
const ARC_RADIUS = 78;

function arcPath(from: number, to: number): string {
  const point = (t: number): string => {
    const angle = ((START_ANGLE + SWEEP * t - 90) * Math.PI) / 180;
    return `${(CENTER + ARC_RADIUS * Math.cos(angle)).toFixed(2)} ${(CENTER + ARC_RADIUS * Math.sin(angle)).toFixed(2)}`;
  };
  const large = (to - from) * SWEEP > 180 ? 1 : 0;
  return `M ${point(from)} A ${ARC_RADIUS} ${ARC_RADIUS} 0 ${large} 1 ${point(to)}`;
}

export interface GaugeHooks {
  onChargeChange(charge: number, charging: boolean): void;
}

/** The pressure gauge is both the cannon's readout and its hold-to-fire button. */
export class CannonGauge {
  readonly root: HTMLElement;
  private readonly sim: Simulation;
  private readonly hooks: GaugeHooks;
  private readonly needle: SVGElement;
  private readonly green: SVGPathElement;
  private readonly cooldownArc: SVGPathElement;
  private readonly caption: Text;
  private readonly result: HTMLElement;
  /** One star per green shot in a row, once the streak upgrade is bought. */
  private readonly stars: HTMLElement;
  private litStars = -1;
  private held = 0;
  private charging = false;
  private greenKey = '';
  private time = 0;
  private needleAngle = START_ANGLE;
  private cooldownPath: string | null = null;

  constructor(parent: HTMLElement, sim: Simulation, hooks: GaugeHooks) {
    this.sim = sim;
    this.hooks = hooks;
    this.root = el('div', 'gauge', parent);
    this.root.dataset.gauge = 'cannon';
    this.root.innerHTML = `
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <path d="${arcPath(0, 1)}" fill="none" stroke="#5a3342" stroke-width="16" stroke-linecap="round"/>
        <path data-part="cool" fill="none" stroke="#c9a67c" stroke-width="16" stroke-linecap="round"/>
        <path d="${arcPath(0.93, 1)}" fill="none" stroke="#e4343c" stroke-width="16"/>
        <path data-part="green" fill="none" stroke="#6fdcbc" stroke-width="16"/>
        <g class="gauge-needle" data-part="needle">
          <path d="M96 104 L100 34 L104 104 Z" fill="#fff1d0" stroke="#3a1d28" stroke-width="2" stroke-linejoin="round"/>
        </g>
        <circle cx="100" cy="100" r="11" fill="#dc3038" stroke="#3a1d28" stroke-width="3"/>
      </svg>`;
    this.needle = this.root.querySelector('[data-part="needle"]')!;
    this.green = this.root.querySelector('[data-part="green"]')!;
    this.cooldownArc = this.root.querySelector('[data-part="cool"]')!;
    this.caption = new Text(el('div', 'gauge-caption', this.root));
    this.result = el('div', 'gauge-result', this.root);
    const stars = el('div', 'gauge-stars', this.root);
    for (let i = 0; i < STREAK_STARS; i += 1) el('i', '', stars).innerHTML = STAR;
    this.stars = stars;

    this.root.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.begin();
    });
    window.addEventListener('pointerup', () => this.release());
    window.addEventListener('pointercancel', () => this.cancel());
    window.addEventListener('blur', () => this.cancel());
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'Space' || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('button, input, textarea, select, [contenteditable]')) return;
      const ui = this.root.closest('#ui');
      if (ui && (ui.classList.contains('is-title') || ui.classList.contains('is-cinematic') || ui.classList.contains('is-photo'))) return;
      if (document.querySelector('.dialog-veil.is-open')) return;
      event.preventDefault();
      this.begin();
    });
    window.addEventListener('keyup', (event) => {
      if (event.code === 'Space') this.release();
    });
  }

  private begin(): void {
    if (!this.sim.cannonReady || this.charging) return;
    this.charging = true;
    this.sim.cannonHeld = true;
    this.held = 0;
  }

  cancel(): void {
    if (!this.charging) return;
    this.charging = false;
    this.sim.cannonHeld = false;
    this.held = 0;
    this.hooks.onChargeChange(0, false);
  }

  private release(): void {
    if (!this.charging) return;
    this.fire(this.held);
  }

  private fire(held: number): void {
    this.charging = false;
    this.sim.cannonHeld = false;
    this.held = 0;
    this.hooks.onChargeChange(0, false);
    const outcome = this.sim.fireCannon(held);
    if (!outcome) return;
    const bonus = cannonStreakBonus(this.sim.derived, this.sim.state.stats.perfectStreak);
    const label =
      outcome.result === 'perfect' && bonus > 0
        ? `绿区！连环 +${Math.round(bonus * 100)}%`
        : { perfect: '绿区！×2', normal: '砰！', overpressure: '炮盖飞了…' }[outcome.result];
    this.result.textContent = label;
    this.result.animate(
      [
        { opacity: 0, transform: 'translate(-50%, 1rem) scale(0.7)' },
        { opacity: 1, transform: 'translate(-50%, 0) scale(1.15)', offset: 0.14 },
        { opacity: 1, transform: 'translate(-50%, -0.5rem) scale(1)', offset: 0.7 },
        { opacity: 0, transform: 'translate(-50%, -1.6rem) scale(1)' },
      ],
      { duration: 1100, easing: 'ease-out' },
    );
  }

  update(deltaSeconds: number): void {
    const sim = this.sim;
    this.time += deltaSeconds;
    setClass(this.root, 'is-unlocked', sim.cannonUnlocked);
    if (!sim.cannonUnlocked) return;

    const { start, end } = cannonGreenRange(sim.derived);
    const key = `${start.toFixed(3)}:${end.toFixed(3)}`;
    if (key !== this.greenKey) {
      this.greenKey = key;
      this.green.setAttribute('d', arcPath(start / CANNON.chargeSeconds, end / CANNON.chargeSeconds));
    }

    let charge = 0;
    if (this.charging) {
      this.held += deltaSeconds;
      charge = Math.min(1, this.held / CANNON.chargeSeconds);
      this.hooks.onChargeChange(charge, true);
      if (this.held >= CANNON.chargeSeconds) this.fire(this.held);
    }

    this.updateStars();

    const cooling = sim.state.cannonCooldown > 0;
    const remaining = sim.state.cannonCooldown / sim.derived.cannonCooldown;
    // Writing a path repaints the dial even when it is the same path, so only changes are written.
    const arc = cooling ? arcPath(0, Math.max(0.001, Math.round(remaining * 400) / 400)) : '';
    if (arc !== this.cooldownPath) {
      this.cooldownPath = arc;
      this.cooldownArc.setAttribute('d', arc);
    }
    setClass(this.root, 'is-ready', sim.cannonReady && !this.charging);
    this.caption.set(
      this.charging ? '松手开炮！' : cooling ? `冷却 ${Math.ceil(sim.state.cannonCooldown)} 秒` : '按住蓄压',
    );

    const tremble = this.charging ? Math.sin(this.time * 70) * (1 + charge * 3) : 0;
    const target = START_ANGLE + SWEEP * charge + tremble;
    this.needleAngle += (target - this.needleAngle) * (this.charging ? 1 : 1 - Math.exp(-deltaSeconds * 14));
    this.needle.style.transform = `rotate(${this.needleAngle.toFixed(2)}deg)`;
  }

  /** Stars light one by one along a green streak; a newly lit one pops in, a broken streak fades out. */
  private updateStars(): void {
    const d = this.sim.derived;
    const on = d.cannonStreakStep > 0;
    setClass(this.stars, 'is-on', on);
    if (!on) return;
    const lit = Math.min(STREAK_STARS, Math.round(cannonStreakBonus(d, this.sim.state.stats.perfectStreak) / d.cannonStreakStep));
    if (lit === this.litStars) return;
    const items = [...this.stars.children] as HTMLElement[];
    items.forEach((star, i) => setClass(star, 'is-lit', i < lit));
    if (lit > this.litStars && this.litStars >= 0) {
      const star = items[lit - 1];
      if (star) play(star, [{ transform: 'scale(1.9)', opacity: 0.4 }, { transform: 'scale(1)', opacity: 1 }], MOTION.release);
    }
    this.litStars = lit;
  }
}
