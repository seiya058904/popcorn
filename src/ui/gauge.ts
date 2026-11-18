import { CANNON } from '../content/skills.ts';
import { cannonGreenRange } from '../sim/economy.ts';
import type { Simulation } from '../sim/simulation.ts';
import { el, setClass, Text } from './dom.ts';

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
  private held = 0;
  private charging = false;
  private greenKey = '';
  private time = 0;
  private needleAngle = START_ANGLE;

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

    this.root.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.begin();
    });
    window.addEventListener('pointerup', () => this.release());
    window.addEventListener('pointercancel', () => this.cancel());
    window.addEventListener('blur', () => this.cancel());
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Space' && !event.repeat) {
        event.preventDefault();
        this.begin();
      }
    });
    window.addEventListener('keyup', (event) => {
      if (event.code === 'Space') this.release();
    });
  }

  private begin(): void {
    if (!this.sim.cannonReady || this.charging) return;
    this.charging = true;
    this.held = 0;
  }

  private cancel(): void {
    if (!this.charging) return;
    this.charging = false;
    this.held = 0;
    this.hooks.onChargeChange(0, false);
  }

  private release(): void {
    if (!this.charging) return;
    this.fire(this.held);
  }

  private fire(held: number): void {
    this.charging = false;
    this.held = 0;
    this.hooks.onChargeChange(0, false);
    const outcome = this.sim.fireCannon(held);
    if (!outcome) return;
    const label = { perfect: '绿区！×2', normal: '砰！', overpressure: '炮盖飞了…' }[outcome.result];
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

    const cooling = sim.state.cannonCooldown > 0;
    const remaining = sim.state.cannonCooldown / sim.derived.cannonCooldown;
    this.cooldownArc.setAttribute('d', cooling ? arcPath(0, Math.max(0.001, remaining)) : '');
    setClass(this.root, 'is-ready', sim.cannonReady && !this.charging);
    this.caption.set(
      this.charging ? '松手开炮！' : cooling ? `冷却 ${Math.ceil(sim.state.cannonCooldown)} 秒` : '按住蓄压',
    );

    const tremble = this.charging ? Math.sin(this.time * 70) * (1 + charge * 3) : 0;
    const target = START_ANGLE + SWEEP * charge + tremble;
    this.needleAngle += (target - this.needleAngle) * (this.charging ? 1 : 1 - Math.exp(-deltaSeconds * 14));
    this.needle.style.transform = `rotate(${this.needleAngle.toFixed(2)}deg)`;
  }
}
