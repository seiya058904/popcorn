/**
 * Interface motion: springs in the iOS sense (a response time and a damping fraction), turned into
 * CSS `linear()` curves so the browser runs them, plus helpers that always start from where an
 * element is right now, so any animation can be interrupted mid-flight without a jump.
 * The numbers here are the ones in docs/INTERACTION.md.
 */

export interface Curve {
  easing: string;
  duration: number;
}

/**
 * A damped spring from 0 to 1. `response` is roughly the time of one swing in seconds;
 * `damping` 1 settles without overshoot, lower values overshoot a little.
 */
export function spring(damping: number, response: number): Curve {
  const stiffness = (2 * Math.PI / response) ** 2;
  const friction = (4 * Math.PI * damping) / response;
  const step = 1 / 240;
  const samples: number[] = [0];
  let x = 0;
  let v = 0;
  let t = 0;
  let settled = 0;
  while (t < 2) {
    for (let i = 0; i < 4; i += 1) {
      v += (stiffness * (1 - x) - friction * v) * step;
      x += v * step;
      t += step;
    }
    samples.push(x);
    // Within half a percent and nearly still: any later motion is too small to see.
    settled = Math.abs(1 - x) < 0.005 && Math.abs(v) < 0.05 ? settled + 1 : 0;
    if (settled > 3) break;
  }
  samples[samples.length - 1] = 1;
  // Thin the curve to about 40 points; linear() interpolates between them.
  const stride = Math.max(1, Math.floor(samples.length / 40));
  const points = samples.filter((_, i) => i % stride === 0 || i === samples.length - 1).map((value) => Number(value.toFixed(4)));
  return { easing: `linear(${points.join(', ')})`, duration: Math.round(t * 1000) };
}

export const MOTION = {
  /** The press itself: quick, so the finger feels it at once. */
  press: { easing: 'cubic-bezier(0.25, 0.6, 0.3, 1)', duration: 70 },
  /** Letting go: a little overshoot, settling back. */
  release: spring(0.7, 0.3),
  /** Things arriving. */
  appear: spring(0.82, 0.3),
  /** Indicators sliding to a new place. */
  slide: spring(0.86, 0.3),
  /** Things leaving: quicker and quieter than they came. */
  exit: { easing: 'cubic-bezier(0.4, 0, 1, 1)', duration: 170 },
  /** Cross-fades between pages and contents. */
  fade: { easing: 'cubic-bezier(0.2, 0, 0, 1)', duration: 190 },
} satisfies Record<string, Curve>;

/** Set by the game from the "reduce motion" setting: movement turns into plain fades. */
export const motionPrefs = { reduced: false };

/**
 * Applies the "reduce motion" setting to scripts and stylesheets alike, and hands the springs to
 * CSS as `--ease-<name>` and `--dur-<name>`, so CSS transitions move exactly like scripted ones.
 */
export function setMotion(root: HTMLElement, reduced: boolean): void {
  motionPrefs.reduced = reduced;
  root.dataset.motion = reduced ? 'reduced' : 'full';
  for (const [name, curve] of Object.entries(MOTION)) {
    root.style.setProperty(`--ease-${name}`, curve.easing);
    root.style.setProperty(`--dur-${name}`, `${curve.duration}ms`);
  }
}

const running = new WeakMap<Element, Animation>();
const flips = new WeakMap<Element, Animation>();

/** Cancels this element's managed animation without committing mid-flight values into inline styles. */
export function stopMotion(node: Element): void {
  const previous = running.get(node);
  if (!previous) return;
  running.delete(node);
  previous.cancel();
}

function current(node: Element, keys: string[]): Keyframe {
  const style = getComputedStyle(node);
  const frame: Keyframe = {};
  for (const key of keys) frame[key] = style.getPropertyValue(key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)) || (style as unknown as Record<string, string>)[key]!;
  return frame;
}

/** Without movement, a transform change happens at once and only the opacity is animated. */
function calm(frames: Keyframe[]): Keyframe[] | null {
  if (!motionPrefs.reduced) return frames;
  const faded = frames.map(({ transform: _transform, ...rest }) => rest);
  return faded.some((frame) => Object.keys(frame).length > 0) ? faded : null;
}

/**
 * Animates from the element's current look to `to`, then leaves `to` in its inline style.
 * Starting again before it ends simply continues from wherever it got to.
 */
export function animateTo(node: HTMLElement | SVGElement, to: Keyframe, curve: Curve): Animation | null {
  const from = current(node, Object.keys(to));
  stopMotion(node);
  const frames = calm([from, to]);
  if (!frames) {
    Object.assign(node.style, to);
    return null;
  }
  const animation = node.animate(frames, { duration: curve.duration, easing: curve.easing, fill: 'forwards' });
  running.set(node, animation);
  animation.onfinish = () => {
    if (running.get(node) !== animation) return;
    animation.commitStyles();
    animation.cancel();
    running.delete(node);
  };
  return animation;
}

/**
 * Plays keyframes that end where the element's stylesheet already puts it, then lets go, so the
 * stylesheet is in charge again afterwards. For entrances, bounces and shakes.
 */
export function play(node: HTMLElement | SVGElement, frames: Keyframe[], curve: Curve): Animation | null {
  stopMotion(node);
  const calmed = calm(frames);
  if (!calmed) return null;
  const animation = node.animate(calmed, { duration: curve.duration, easing: curve.easing });
  running.set(node, animation);
  const clear = (): void => {
    if (running.get(node) === animation) running.delete(node);
  };
  animation.onfinish = clear;
  animation.oncancel = clear;
  return animation;
}

/**
 * Changes something that moves an element (a class, a CSS variable), then glides it from where it
 * was to where it now belongs. The stylesheet keeps the final position.
 */
export function glide(node: HTMLElement | SVGElement, change: () => void, curve: Curve = MOTION.slide): void {
  const before = getComputedStyle(node).transform;
  stopMotion(node);
  change();
  const after = getComputedStyle(node).transform;
  if (before === after || motionPrefs.reduced) return;
  const animation = node.animate([{ transform: before }, { transform: after }], { duration: curve.duration, easing: curve.easing });
  running.set(node, animation);
  const clear = (): void => {
    if (running.get(node) === animation) running.delete(node);
  };
  animation.onfinish = clear;
  animation.oncancel = clear;
}

/**
 * Smoothly moves list items to their new places after the list changed: records where each one
 * was, lets `change` reorder or hide things, then animates every item from its old spot.
 */
export function flip(items: readonly HTMLElement[], change: () => void, curve: Curve = MOTION.slide): void {
  const before = new Map(items.map((item) => [item, item.getBoundingClientRect()]));
  for (const item of items) {
    const previous = flips.get(item);
    if (previous) {
      flips.delete(item);
      previous.cancel();
    }
  }
  change();
  if (motionPrefs.reduced) return;
  for (const item of items) {
    const old = before.get(item)!;
    if (old.width === 0 || item.offsetParent === null) continue;
    const now = item.getBoundingClientRect();
    const dy = old.top - now.top;
    if (Math.abs(dy) < 0.5) continue;
    const animation = item.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: curve.duration, easing: curve.easing });
    flips.set(item, animation);
    const clear = (): void => {
      if (flips.get(item) === animation) flips.delete(item);
    };
    animation.onfinish = clear;
    animation.oncancel = clear;
  }
}
