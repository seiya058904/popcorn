import { clamp01, easeInOutCubic, easeOutCubic, lerp } from '../motion/ease.ts';
import { el } from './dom.ts';
import { UNIT_ICONS } from './icons.ts';
import { motionPrefs } from './motion.ts';

export interface ScreenPoint {
  x: number;
  y: number;
}

/** How long a bought ticket takes to reach its machine. The machine's entrance waits for it. */
export const FLY_SECONDS = 0.55;
/** Tickets in the air at once; past this, a purchase simply arrives as before. */
const MAX_TICKETS = 4;
const MAX_CRUMBS = 36;

interface Ticket {
  node: HTMLElement;
  from: ScreenPoint;
  to: ScreenPoint;
  target: () => ScreenPoint | null;
  t: number;
  duration: number;
  arc: number;
  /** Only fades where it stands (reduced motion). */
  still: boolean;
  land: (() => void) | null;
}

interface Crumb {
  node: HTMLElement;
  from: ScreenPoint;
  bend: number;
  t: number;
  duration: number;
  last: boolean;
}

/**
 * Interface things that travel to the scene and back: a bought ticket flying from the shop to the
 * place its machine will stand, and the little popcorn that streams into the counter after a big
 * moment. Driven by the game's own frames, so captures stay repeatable and a pause holds them.
 */
export class FlyIn {
  private readonly root: HTMLElement;
  private readonly layer: HTMLElement;
  private readonly tickets: Ticket[] = [];
  private readonly crumbs: Crumb[] = [];
  private counterEl: HTMLElement | null = null;
  private seed = 7;
  /** Called as each streamed piece reaches the counter; `last` for the final one. */
  onCrumb: ((last: boolean) => void) | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.layer = el('div', 'flyin-layer', root);
    this.layer.setAttribute('aria-hidden', 'true');
  }

  get flying(): number {
    return this.tickets.length;
  }

  /**
   * Sends a copy of a machine's ticket from its stub in the shop to `target` on screen, which is
   * asked again every frame so it follows a moving camera. `land` runs as it arrives, at once if
   * nothing flies. Returns how long the flight takes, 0 if none.
   */
  ticket(unit: number, quantity: number, target: () => ScreenPoint | null, land: () => void): number {
    const stub = this.root.querySelector<HTMLElement>(`.ticket[data-unit="${unit}"] .ticket-stub`);
    const rect = stub?.getBoundingClientRect();
    const to = target();
    const hidden = this.root.classList.contains('is-cinematic') || !rect || rect.width === 0 || rect.right > window.innerWidth + 1;
    if (hidden || !to || this.tickets.length >= MAX_TICKETS) {
      land();
      return 0;
    }
    const node = el('div', 'flyin-ticket', this.layer);
    node.innerHTML = UNIT_ICONS[unit] ?? '';
    if (quantity > 1) el('b', 'flyin-count num', node, `×${quantity}`);
    const from = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const still = motionPrefs.reduced;
    const flight: Ticket = {
      node,
      from,
      to,
      target,
      t: 0,
      duration: still ? 0.3 : FLY_SECONDS,
      arc: Math.min(220, 60 + Math.hypot(to.x - from.x, to.y - from.y) * 0.25),
      still,
      land: still ? null : land,
    };
    this.tickets.push(flight);
    this.placeTicket(flight);
    if (still) {
      // Without the flight, the machine arrives as it always has.
      land();
      return 0;
    }
    return FLY_SECONDS;
  }

  private counterTarget(): ScreenPoint | null {
    if (!this.counterEl?.isConnected) this.counterEl = this.root.querySelector<HTMLElement>('[data-counter="popcorn"]');
    if (!this.counterEl) return null;
    const rect = this.counterEl.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  /** A handful of popcorn from a point on screen into the counter. */
  stream(fromX: number, fromY: number, count: number): void {
    const to = this.counterTarget();
    if (motionPrefs.reduced || !to || this.root.classList.contains('is-cinematic')) {
      this.onCrumb?.(true);
      return;
    }
    const n = Math.min(count, MAX_CRUMBS - this.crumbs.length);
    if (n <= 0) return;
    for (let i = 0; i < n; i += 1) {
      // Drawn in CSS gradients: an SVG path re-rasterized at every scale on the way cost a long GPU frame.
      const node = el('div', 'flyin-crumb', this.layer);
      const crumb: Crumb = {
        node,
        from: { x: fromX + (this.random() - 0.5) * 40, y: fromY + (this.random() - 0.5) * 30 },
        bend: (this.random() - 0.5) * 260,
        // Staggered, so they arrive as a little stream rather than all at once.
        t: -i * 0.045,
        duration: 0.5 + this.random() * 0.18,
        last: i === n - 1,
      };
      this.crumbs.push(crumb);
      this.placeCrumb(crumb, to);
    }
  }

  update(dt: number): void {
    if (dt <= 0) return;
    for (let i = this.tickets.length - 1; i >= 0; i -= 1) {
      const flight = this.tickets[i]!;
      flight.t += dt;
      if (flight.t >= flight.duration) {
        flight.node.remove();
        this.tickets.splice(i, 1);
        flight.land?.();
        continue;
      }
      this.placeTicket(flight);
    }
    if (this.crumbs.length === 0) return;
    const to = this.counterTarget();
    for (let i = this.crumbs.length - 1; i >= 0; i -= 1) {
      const crumb = this.crumbs[i]!;
      crumb.t += dt;
      if (crumb.t >= crumb.duration || !to) {
        crumb.node.remove();
        this.crumbs.splice(i, 1);
        this.onCrumb?.(crumb.last);
        continue;
      }
      this.placeCrumb(crumb, to);
    }
  }

  private placeTicket(flight: Ticket): void {
    const u = clamp01(flight.t / flight.duration);
    const { node, from } = flight;
    if (flight.still) {
      node.style.transform = `translate(${from.x}px, ${from.y}px) translate(-50%, -50%)`;
      node.style.opacity = String(1 - u);
      return;
    }
    flight.to = flight.target() ?? flight.to;
    const to = flight.to;
    // Leaves the stub briskly, rises over an arc and speeds into its landing.
    const e = easeInOutCubic(u);
    const cx = (from.x + to.x) / 2;
    const cy = Math.min(from.y, to.y) - flight.arc;
    const x = (1 - e) * (1 - e) * from.x + 2 * (1 - e) * e * cx + e * e * to.x;
    const y = (1 - e) * (1 - e) * from.y + 2 * (1 - e) * e * cy + e * e * to.y;
    const pop = Math.sin(Math.min(1, u / 0.22) * Math.PI) * 0.22;
    const scale = lerp(1, 0.42, easeOutCubic((u - 0.45) / 0.55)) + pop;
    const turn = lerp(-10, 8, e);
    node.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${turn}deg) scale(${scale})`;
    node.style.opacity = String(1 - clamp01((u - 0.88) / 0.12));
  }

  private placeCrumb(crumb: Crumb, to: ScreenPoint): void {
    const u = clamp01(crumb.t / crumb.duration);
    if (crumb.t < 0) {
      crumb.node.style.opacity = '0';
      return;
    }
    const e = easeInOutCubic(u);
    const cx = (crumb.from.x + to.x) / 2 + crumb.bend;
    const cy = Math.min(crumb.from.y, to.y) - 40;
    const x = (1 - e) * (1 - e) * crumb.from.x + 2 * (1 - e) * e * cx + e * e * to.x;
    const y = (1 - e) * (1 - e) * crumb.from.y + 2 * (1 - e) * e * cy + e * e * to.y;
    const scale = lerp(1.1, 0.55, e);
    crumb.node.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${crumb.bend * e}deg) scale(${scale})`;
    crumb.node.style.opacity = String(Math.min(1, u * 6));
  }

  /** A small repeatable sequence, so captures come out the same each time. */
  private random(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
}
