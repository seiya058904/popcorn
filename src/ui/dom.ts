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

  /** Returns true when the text actually changed. */
  set(value: string): boolean {
    if (value === this.value) return false;
    this.value = value;
    this.node.textContent = value;
    return true;
  }

  get element(): HTMLElement {
    return this.node;
  }
}

export function setClass(node: HTMLElement, name: string, on: boolean): void {
  if (node.classList.contains(name) !== on) node.classList.toggle(name, on);
}

