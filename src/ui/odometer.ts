/**
 * A rolling-digit readout, like the counter on an old cinema till. Each digit is a column holding
 * 0-9 three times over that slides to its new value, always rolling forward, so 9 turns over to 0
 * instead of spinning back through every digit. Other characters (the decimal point, 万, 亿) sit
 * still. Columns are matched from the right, so the last digits keep rolling as the number grows.
 *
 * A column rests in the middle set of ten. Rolling forward takes it at most nine lines into the
 * third set; before the next roll it is moved back by ten lines, which shows the same digits, from
 * wherever it has got to on screen. A counter that changes every frame never lets a roll finish,
 * so this cannot wait for the end of a transition.
 */
const LINES = 30;
const STEP = 100 / LINES;

interface Cell {
  char: string;
  node: HTMLElement;
  strip?: HTMLElement;
  /** Line of the strip the column is rolling to. */
  position: number;
}

export class Odometer {
  private readonly root: HTMLElement;
  private cells: Cell[] = [];
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
      if (cell.position >= 20) this.wrap(cell);
      const digit = Number(char);
      // Always forward: a smaller digit is reached through the next set of ten.
      const at = cell.position % 10;
      cell.position = digit >= at ? cell.position - at + digit : cell.position - at + 10 + digit;
      cell.strip.style.transform = `translateY(${-cell.position * STEP}%)`;
    });
  }

  /** Moves a column back by ten lines without anything visibly changing. */
  private wrap(cell: Cell): void {
    const strip = cell.strip!;
    const line = strip.getBoundingClientRect().height / LINES;
    // Where the strip is this moment, mid-roll, in lines.
    const offset = new DOMMatrixReadOnly(getComputedStyle(strip).transform).m42;
    const now = line > 0 ? -offset / line : cell.position;
    cell.position -= 10;
    strip.style.transition = 'none';
    strip.style.transform = `translateY(${-Math.max(0, now - 10) * STEP}%)`;
    void strip.offsetWidth;
    strip.style.transition = '';
  }

  private rebuild(chars: string[]): void {
    const old = this.cells;
    const kept = new Map<number, Cell>();
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
        // Thirty lines, one digit each: 0-9 three times, so the roll can always go forward.
        strip.textContent = '012345678901234567890123456789'.split('').join('\n');
        node.append(strip);
        const position = 10 + Number(char);
        strip.style.transform = `translateY(${-position * STEP}%)`;
        return { char, node, strip, position };
      }
      const node = document.createElement('span');
      node.className = 'odo-char';
      node.textContent = char;
      return { char, node, position: 0 };
    });
    this.root.replaceChildren(...this.cells.map((cell) => cell.node));
    // A column that has come to rest in the third set moves back to the middle one.
    for (const cell of this.cells) {
      if (!cell.strip || cell.strip.dataset.wraps) continue;
      cell.strip.dataset.wraps = '1';
      const strip = cell.strip;
      strip.addEventListener('transitionend', () => {
        const owner = this.cells.find((c) => c.strip === strip);
        if (!owner || owner.position < 20) return;
        owner.position -= 10;
        strip.style.transition = 'none';
        strip.style.transform = `translateY(${-owner.position * STEP}%)`;
        void strip.offsetWidth;
        strip.style.transition = '';
      });
    }
  }
}
