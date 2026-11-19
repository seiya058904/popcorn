import { feedback } from './feedback.ts';
import { MOTION, motionPrefs, play } from './motion.ts';

/**
 * How every button behaves (docs/INTERACTION.md, 2.1): it shows the press on the very frame the
 * pointer goes down, acts only when released inside, and lets the player change their mind by
 * dragging away. Keyboard presses act at once. Gameplay controls (the pot, the cannon) do not use
 * this: they act the moment they are pressed.
 */
export interface PressOptions {
  /** Runs on release inside the element. Returning false means it could not be done. */
  action(): boolean | void;
  /** How far it sinks while held: 0.96 for buttons, 0.98 for big cards, 0.9 for small icons. */
  scale?: number;
  /** Holding keeps repeating the action, faster and faster. */
  repeat?: boolean;
  /** Holding this long does it, with progress shown on the way; letting go earlier cancels. */
  holdMs?: number;
  onHoldProgress?(progress: number): void;
  /** Skip the press and release sounds, for controls that make their own. */
  quiet?: boolean;
  /** Keep the press tick but skip the release sound, when the action itself makes a sound (buying). */
  silentRelease?: boolean;
}

/** Pixels of movement before a press becomes a drag (and is cancelled). */
const SLOP = 10;
/** A release this far outside the element still counts as inside, for fingers. */
const MARGIN = 8;
const REPEAT_AFTER_MS = 400;
const REPEAT_FIRST_MS = 210;
const REPEAT_FASTEST_MS = 55;
const REPEAT_SPEEDUP = 0.82;

/**
 * The "no" shake, with its sound and buzz. It is added on top of whatever the element is doing,
 * so the spring back from the press carries on underneath instead of snapping.
 */
export function deny(node: HTMLElement): void {
  feedback.deny();
  if (motionPrefs.reduced) return;
  node.animate(
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-0.5rem)' },
      { transform: 'translateX(0.42rem)' },
      { transform: 'translateX(-0.24rem)' },
      { transform: 'translateX(0.1rem)' },
      { transform: 'translateX(0)' },
    ],
    { duration: 300, easing: 'ease-out', composite: 'add' },
  );
}

/** A small bounce that ends where the element rests, e.g. after a keyboard press. */
export function bounce(node: HTMLElement, scale = 0.96): void {
  play(node, [{ transform: `scale(${scale})` }, { transform: 'scale(1)' }], MOTION.release);
}

export function pressable(node: HTMLElement, options: PressOptions): void {
  const scale = options.scale ?? 0.96;
  let pointer: number | null = null;
  let startX = 0;
  let startY = 0;
  let repeated = false;
  let timer = 0;
  let frame = 0;
  let pressAnimation: Animation | null = null;

  const down = (): void => {
    node.classList.add('is-pressed');
    if (motionPrefs.reduced) return;
    const from = getComputedStyle(node).transform;
    pressAnimation?.cancel();
    pressAnimation = node.animate([{ transform: from }, { transform: `scale(${scale})` }], { duration: MOTION.press.duration, easing: MOTION.press.easing, fill: 'forwards' });
  };

  const up = (): void => {
    node.classList.remove('is-pressed', 'is-repeating');
    if (!pressAnimation) return;
    const from = getComputedStyle(node).transform;
    pressAnimation.cancel();
    const release = node.animate([{ transform: from }, { transform: 'scale(1)' }], { duration: MOTION.release.duration, easing: MOTION.release.easing });
    pressAnimation = release;
    release.onfinish = () => {
      if (pressAnimation === release) pressAnimation = null;
    };
  };

  const stopTimers = (): void => {
    window.clearTimeout(timer);
    cancelAnimationFrame(frame);
    timer = 0;
    frame = 0;
  };

  const run = (): boolean => {
    const ok = options.action() !== false;
    if (!ok) deny(node);
    else if (!options.quiet && !options.silentRelease) feedback.release();
    return ok;
  };

  const end = (): void => {
    if (pointer !== null) {
      try {
        node.releasePointerCapture(pointer);
      } catch {
        // Already released.
      }
    }
    pointer = null;
    stopTimers();
    options.onHoldProgress?.(0);
    up();
  };

  const repeatStep = (wait: number): void => {
    timer = window.setTimeout(() => {
      repeated = true;
      node.classList.add('is-repeating');
      if (!run()) {
        stopTimers();
        return;
      }
      repeatStep(wait === REPEAT_AFTER_MS ? REPEAT_FIRST_MS : Math.max(REPEAT_FASTEST_MS, wait * REPEAT_SPEEDUP));
    }, wait);
  };

  const holdStep = (startedAt: number): void => {
    frame = requestAnimationFrame(() => {
      const progress = Math.min(1, (performance.now() - startedAt) / options.holdMs!);
      options.onHoldProgress?.(progress);
      if (progress < 1) {
        holdStep(startedAt);
        return;
      }
      repeated = true;
      run();
      end();
    });
  };

  const outside = (event: PointerEvent): boolean => {
    const box = node.getBoundingClientRect();
    return event.clientX < box.left - MARGIN || event.clientX > box.right + MARGIN || event.clientY < box.top - MARGIN || event.clientY > box.bottom + MARGIN;
  };

  node.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || pointer !== null) return;
    pointer = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    repeated = false;
    try {
      node.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events cannot be captured; the press still works.
    }
    down();
    if (!options.quiet) feedback.press();
    if (options.repeat) repeatStep(REPEAT_AFTER_MS);
    if (options.holdMs) holdStep(performance.now());
  });

  node.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointer) return;
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > SLOP || outside(event)) end();
  });

  node.addEventListener('pointerup', (event) => {
    if (event.pointerId !== pointer) return;
    const act = !outside(event) && !repeated && !options.holdMs;
    end();
    if (act) run();
  });

  node.addEventListener('pointercancel', (event) => {
    if (event.pointerId === pointer) end();
  });

  // Enter and Space on a focused button arrive as a click with no pointer behind it.
  node.addEventListener('click', (event) => {
    if (event.detail !== 0) return;
    if (options.holdMs) return;
    bounce(node, scale);
    run();
  });

  // A hold-to-confirm button is held with the keyboard the same way.
  if (options.holdMs) {
    let keyHeld = false;
    node.addEventListener('keydown', (event) => {
      if ((event.key !== 'Enter' && event.key !== ' ') || event.repeat || keyHeld) return;
      event.preventDefault();
      keyHeld = true;
      repeated = false;
      down();
      holdStep(performance.now());
    });
    node.addEventListener('keyup', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      keyHeld = false;
      end();
    });
  }
}
