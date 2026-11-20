import { el } from './dom.ts';
import { pressable } from './press.ts';

/** A desktop screen with a mouse beside it. */
const MONITOR =
  '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="4" y="8" width="34" height="23" rx="4" fill="#ffe9a8" stroke="#3a1d28" stroke-width="2.5"/><path d="M16 39h10M21 31v8" stroke="#3a1d28" stroke-width="2.5" stroke-linecap="round"/><rect x="36" y="27" width="8" height="13" rx="4" fill="#fff4e2" stroke="#3a1d28" stroke-width="2.5"/></svg>';

/**
 * The game is made for a desktop screen and a mouse. A phone or a small window gets a word about
 * that before the title, and can still go on. Nothing is shown on a desktop.
 */
export function needsHandheldNotice(): boolean {
  const touchOnly = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
  return touchOnly || window.innerWidth <= 720 || window.innerHeight <= 480;
}

/** Shows the notice over the title; resolves when the player chooses to go on. */
export function showHandheldNotice(root: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const veil = el('div', 'handheld', root);
    const card = el('div', 'handheld-card', veil);
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    el('div', 'handheld-icon', card).innerHTML = MONITOR;
    el('h2', '', card, '在电脑上玩更带劲');
    el('p', '', card, '这一锅是为电脑屏幕和鼠标做的。手机和小窗口也能打开，只是界面会挤一些。');
    const go = el('button', 'btn is-large', card, '仍要进入');
    pressable(go, {
      action: () => {
        veil.classList.add('is-gone');
        window.setTimeout(() => veil.remove(), 220);
        resolve();
      },
    });
  });
}
