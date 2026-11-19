/**
 * A rolling-digit readout, like the counter on an old cinema till. Each digit is a column of
 * 0-9 twice over that slides to its new value, always rolling forward, so 9 turns over to 0 instead
 * of spinning back through every digit. Other characters (the decimal point, 万, 亿) sit still.
 * Columns are matched from the right, so the last digits keep rolling as the number grows longer.
 */
export class Odometer {
  private readonly root: HTMLElement;
  private cells: Array<{ char: string; node: HTMLElement; strip?: HTMLElement; position: number }> = [];
  private text = '';

  constructor(root: HTMLElement) {
    this.root = root;
    root.classList.add('odometer');
    root.setAttribute('aria-live', 'off');
  }

  set(text: string): void {
    if (text === this.text) return;
    this.text = text;
    this.root.setAttribute('aria-label', text);
    const chars = [...text];
    // Anything but a digit in a different place means a different layout: rebuild it.
    const sameShape =
      chars.length === this.cells.length && chars.every((char, i) => (/\d/.test(char) ? this.cells[i]!.strip !== undefined : this.cells[i]!.char === char));
    if (!sameShape) this.rebuild(chars);
    chars.forEach((char, i) => {
      const cell = this.cells[i]!;
      if (!cell.strip || cell.char === char) return;
      cell.char = char;
      const digit = Number(char);
      // Always forward: a smaller digit is reached through the second set of ten.
      const at = cell.position % 10;
      cell.position = digit >= at ? cell.position - at + digit : cell.position - at + 10 + digit;
      cell.strip.style.transform = `translateY(${-cell.position * 5}%)`;
    });
  }

  private rebuild(chars: string[]): void {
    const old = this.cells;
    const kept = new Map<number, (typeof old)[number]>();
    // Reuse digit columns counted from the right, so they keep rolling instead of jumping.
    for (let i = 0; i < old.length; i += 1) kept.set(old.length - 1 - i, old[i]!);
    this.cells = chars.map((char, i) => {
      const fromRight = chars.length - 1 - i;
      const reuse = kept.get(fromRight);
      if (/\d/.test(char) && reuse?.strip) {
        kept.delete(fromRight);
        return reuse;
      }
      if (/\d/.test(char)) {
        const node = document.createElement('span');
        node.className = 'odo-digit';
        const strip = document.createElement('span');
        strip.className = 'odo-strip';
        // Twenty lines, one digit each: 0-9 and again, so the roll can always go forward.
        strip.textContent = '01234567890123456789'.split('').join('\n');
        node.append(strip);
        const position = Number(char);
        strip.style.transform = `translateY(${-position * 5}%)`;
        return { char, node, strip, position };
      }
      const node = document.createElement('span');
      node.className = 'odo-char';
      node.textContent = char;
      return { char, node, position: 0 };
    });
    this.root.replaceChildren(...this.cells.map((cell) => cell.node));
    // After a column passes 9, it quietly moves back into the first set of ten.
    for (const cell of this.cells) {
      if (!cell.strip || cell.strip.dataset.wraps) continue;
      cell.strip.dataset.wraps = '1';
      const strip = cell.strip;
      strip.addEventListener('transitionend', () => {
        const owner = this.cells.find((c) => c.strip === strip);
        if (!owner || owner.position < 10) return;
        owner.position -= 10;
        strip.style.transition = 'none';
        strip.style.transform = `translateY(${-owner.position * 5}%)`;
        void strip.offsetWidth;
        strip.style.transition = '';
      });
    }
  }
}
