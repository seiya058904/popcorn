export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  parent?: HTMLElement,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  parent?.append(node);
  return node;
}

/** Writes to the DOM only when the value actually changed. */
export class Text {
  private value: string | null = null;
  private readonly node: HTMLElement;

  constructor(node: HTMLElement) {
    this.node = node;
  }

  set(value: string): void {
    if (value === this.value) return;
    this.value = value;
    this.node.textContent = value;
  }
}

export function setClass(node: HTMLElement, name: string, on: boolean): void {
  if (node.classList.contains(name) !== on) node.classList.toggle(name, on);
}

/** The press-and-rebound every interactive element shares. */
export function pressBounce(node: HTMLElement, scale = 0.95): void {
  node.animate(
    [
      { transform: `scale(${scale}) translateY(0.2rem)` },
      { transform: 'scale(1.025) translateY(-0.1rem)', offset: 0.55 },
      { transform: 'scale(1) translateY(0)' },
    ],
    { duration: 220, easing: 'cubic-bezier(.2,.8,.3,1)' },
  );
}

export function deny(node: HTMLElement): void {
  node.animate(
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-0.5rem)' },
      { transform: 'translateX(0.4rem)' },
      { transform: 'translateX(-0.2rem)' },
      { transform: 'translateX(0)' },
    ],
    { duration: 200, easing: 'ease-out' },
  );
}
