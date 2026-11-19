/**
 * What the player hears and feels when they touch the interface. Every press, switch and slider
 * goes through here, so the same action always gives the same response.
 * See the sound and haptics table in docs/INTERACTION.md.
 */

export interface FeedbackSinks {
  /** Plays an interface sound; `rate` shifts its pitch. */
  sound(name: string, rate?: number): void;
}

let sinks: FeedbackSinks = { sound: () => undefined };
let haptics = true;

/** Vibration where the device has it (mostly Android); elsewhere sound and motion carry it. */
function buzz(pattern: number | number[]): void {
  if (!haptics || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers refuse before the first user gesture; feedback is never essential.
  }
}

export const feedback = {
  connect(next: FeedbackSinks): void {
    sinks = next;
  },
  setHaptics(on: boolean): void {
    haptics = on;
  },
  press(): void {
    sinks.sound('ui-press');
    buzz(8);
  },
  release(): void {
    sinks.sound('ui-release');
  },
  /** Segmented controls and tabs. */
  select(): void {
    sinks.sound('ui-tab');
    buzz(8);
  },
  toggle(on: boolean): void {
    sinks.sound(on ? 'ui-switch-on' : 'ui-switch-off');
    buzz(10);
  },
  /** A slider passed a tenth of its range; the pitch climbs with the value. */
  tick(value: number): void {
    sinks.sound('ui-tick', 0.8 + value * 0.6);
    buzz(5);
  },
  open(): void {
    sinks.sound('ui-open');
  },
  close(): void {
    sinks.sound('ui-close');
  },
  success(): void {
    sinks.sound('ui-success');
    buzz([10, 30, 14]);
  },
  deny(): void {
    sinks.sound('ui-deny');
    buzz([24, 40, 24]);
  },
  /** Purchases already have their own sound in the game; this is only the touch. */
  bought(): void {
    buzz(10);
  },
  milestone(): void {
    buzz([18, 30, 18, 30, 30]);
  },
  heavy(): void {
    buzz([40, 30, 60]);
  },
};
