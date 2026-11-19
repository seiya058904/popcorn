import { feedback } from './feedback.ts';
import { MOTION, motionPrefs } from './motion.ts';

/**
 * Dialog presentation shared by every pop-up: the world behind blurs and dims while the card rises
 * into place on a spring; closing is quicker and quieter. Reopening mid-close simply turns around.
 */
const closing = new WeakMap<HTMLElement, Animation[]>();

function stopClosing(veil: HTMLElement): void {
  for (const animation of closing.get(veil) ?? []) {
    animation.onfinish = null;
    animation.cancel();
  }
  closing.delete(veil);
}

export function isSheetOpen(veil: HTMLElement): boolean {
  return veil.classList.contains('is-open') && !closing.has(veil);
}

export function openSheet(veil: HTMLElement, card: HTMLElement): void {
  const wasOpen = isSheetOpen(veil);
  stopClosing(veil);
  veil.classList.add('is-open');
  if (wasOpen) return;
  feedback.open();
  veil.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.fade.duration, easing: MOTION.fade.easing });
  const rise = motionPrefs.reduced
    ? [{ opacity: 0 }, { opacity: 1 }]
    : [
        { opacity: 0, transform: 'translateY(1.6rem) scale(0.94)' },
        { opacity: 1, transform: 'none' },
      ];
  card.animate(rise, { duration: MOTION.appear.duration, easing: MOTION.appear.easing });
}

export function closeSheet(veil: HTMLElement, card: HTMLElement, after?: () => void): void {
  if (!veil.classList.contains('is-open') || closing.has(veil)) return;
  feedback.close();
  const exit = { duration: MOTION.exit.duration, easing: MOTION.exit.easing, fill: 'forwards' as const };
  const sink = motionPrefs.reduced ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.97)' }];
  const animations = [veil.animate([{ opacity: 1 }, { opacity: 0 }], exit), card.animate(sink, exit)];
  closing.set(veil, animations);
  animations[0]!.onfinish = () => {
    if (closing.get(veil) !== animations) return;
    closing.delete(veil);
    veil.classList.remove('is-open');
    for (const animation of animations) animation.cancel();
    after?.();
  };
}
