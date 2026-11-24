import { el, setClass } from './dom.ts';
import { feedback } from './feedback.ts';
import { glide, stopMotion } from './motion.ts';
import { pressable } from './press.ts';

/**
 * A segmented control: a sunken track with a thumb that slides under the chosen item.
 * Choosing clicks, slides the thumb on a spring, and tells the owner.
 */
export class Segmented {
  readonly root: HTMLElement;
  private readonly thumb: HTMLElement;
  readonly items: HTMLButtonElement[] = [];
  private index = 0;

  constructor(parent: HTMLElement, className: string, labels: string[], onChange: (index: number, previous: number) => void, decorate?: (button: HTMLButtonElement, label: string) => void) {
    this.root = el('div', `seg ${className}`, parent);
    this.root.style.setProperty('--count', String(labels.length));
    this.thumb = el('i', 'seg-thumb', this.root);
    labels.forEach((label, index) => {
      const button = el('button', 'seg-item', this.root);
      if (decorate) decorate(button, label);
      else button.textContent = label;
      pressable(button, {
        quiet: true,
        scale: 0.94,
        action: () => {
          if (index === this.index) return;
          feedback.select();
          const previous = this.index;
          this.select(index);
          onChange(index, previous);
        },
      });
      this.items.push(button);
    });
    this.select(0, false);
  }

  select(index: number, animate = true): void {
    this.index = index;
    const move = (): void => this.root.style.setProperty('--index', String(index));
    if (animate) glide(this.thumb, move);
    else {
      stopMotion(this.thumb);
      move();
    }
    this.items.forEach((item, i) => setClass(item, 'is-active', i === index));
  }
}
