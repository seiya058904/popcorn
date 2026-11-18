import { formatAmount } from '../content/format.ts';
import { PRODUCERS } from '../content/producers.ts';
import { tuning } from '../motion/tuning.ts';
import type { Simulation } from '../sim/simulation.ts';
import './hud.css';

const FLOAT_POOL = 24;

/** First-playable HUD; replaced by the ticket-stub interface in M3. */
export class Hud {
  private readonly count = document.createElement('div');
  private readonly rate = document.createElement('div');
  private readonly counter = document.createElement('div');
  private readonly button = document.createElement('button');
  private readonly buttonCost = document.createElement('span');
  private readonly buttonOwned = document.createElement('span');
  private readonly floats: HTMLElement[] = [];
  private floatCursor = 0;
  private readonly sim: Simulation;

  constructor(root: HTMLElement, sim: Simulation) {
    this.sim = sim;
    this.counter.className = 'hud-counter';
    this.count.className = 'hud-count';
    this.rate.className = 'hud-rate';
    this.counter.append(this.count, this.rate);

    this.button.className = 'hud-buy';
    const name = document.createElement('strong');
    name.textContent = PRODUCERS[0]!.name;
    this.buttonOwned.className = 'hud-owned';
    this.buttonCost.className = 'hud-cost';
    this.button.append(name, this.buttonOwned, this.buttonCost);
    this.button.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      if (this.sim.buy(0)) this.bump(this.button);
    });

    root.append(this.counter, this.button);
    for (let i = 0; i < FLOAT_POOL; i += 1) {
      const float = document.createElement('div');
      float.className = 'hud-float';
      root.append(float);
      this.floats.push(float);
    }
  }

  private bump(element: HTMLElement): void {
    element.animate(
      [{ transform: 'scale(0.94)' }, { transform: 'scale(1.03)' }, { transform: 'scale(1)' }],
      { duration: 180, easing: 'ease-out' },
    );
  }

  floatGain(x: number, y: number, gain: number): void {
    const float = this.floats[this.floatCursor]!;
    this.floatCursor = (this.floatCursor + 1) % FLOAT_POOL;
    float.textContent = `+${formatAmount(gain)}`;
    float.style.left = `${x}px`;
    float.style.top = `${y}px`;
    float.getAnimations().forEach((animation) => animation.cancel());
    float.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.6)', opacity: 0 },
        { transform: 'translate(-50%, -110%) scale(1.15)', opacity: 1, offset: 0.14 },
        { transform: 'translate(-50%, -260%) scale(1)', opacity: 0 },
      ],
      { duration: 620, easing: 'cubic-bezier(.2,.7,.3,1)' },
    );
  }

  popCounter(): void {
    this.count.getAnimations().forEach((animation) => animation.cancel());
    this.count.animate(
      [{ transform: `scale(${tuning.counterPopScale})` }, { transform: 'scale(1)' }],
      { duration: tuning.counterPopMs, easing: 'ease-out' },
    );
  }

  update(pendingGain: number): void {
    const { state, perSecond } = this.sim;
    this.count.textContent = formatAmount(Math.max(0, state.popcorn - pendingGain));
    this.rate.textContent = `每秒 ${formatAmount(perSecond)}`;
    const price = this.sim.price(0);
    this.buttonCost.textContent = formatAmount(price);
    this.buttonOwned.textContent = `×${state.owned[0]}`;
    this.button.classList.toggle('is-ready', state.popcorn >= price);
  }
}
