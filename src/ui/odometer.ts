/**
 * A rolling-digit readout, like the counter on an old cinema till. Each digit is a column holding
 * 0-9 three times over that slides to its new value, always rolling forward, so 9 turns over to 0
 * instead of spinning back through every digit. Other characters (the decimal point, 万, 亿) sit
 * still. Columns are matched from the right, so the last digits keep rolling as the number grows.
 *
 * A column rests in the middle set of ten. Rolling forward takes it at most nine lines into the
 * third set; the next roll starts ten lines further back, which shows the same digits. Each roll is
 * a Web Animation with both ends given, so going back ten lines is arithmetic: a CSS transition
 * would need its start forced with a style flush, which with the counter changing every frame cost
 * about 4% of the main thread on a slowed-down CPU.
 */
const LINES = 30;
const STEP = 100 / LINES;
/** The roll: 0.24 s on cubic-bezier(0.2, 0.75, 0.2, 1). */
const ROLL_MS = 240;
const ROLL = [0.2, 0.75, 0.2, 1] as const;

interface Cell {
  char: string;
  node: HTMLElement;
  strip?: HTMLElement;
  roll?: Animation;
  /** Line of the strip the column is rolling to. */
  position: number;
  /** Line the current roll started from, and when, for working out where it is mid-roll. */
  from: number;
  start: number;
}

/** CSS cubic-bezier timing: the eased progress for a time fraction `x` of the transition. */
function cubicBezier(x: number, [x1, y1, x2, y2]: readonly [number, number, number, number]): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bx = (u: number): number => 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u;
  const by = (u: number): number => 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
  // The x curve only rises, so halving the interval always finds the parameter.
  let low = 0;
  let high = 1;
  for (let i = 0; i < 20; i += 1) {
    const mid = (low + high) / 2;
    if (bx(mid) < x) low = mid;
    else high = mid;
  }
  return by((low + high) / 2);
}

const reduced = (): boolean => document.documentElement.dataset.motion === 'reduced';

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
    const now = performance.now();
    chars.forEach((char, i) => {
      const cell = this.cells[i]!;
      if (!cell.strip || cell.char === char) return;
      cell.char = char;
      let from = this.shown(cell, now);
      // Back to the middle set: the same digits, ten lines up.
      if (cell.position >= 20) {
        cell.position -= 10;
        from = Math.max(0, from - 10);
      }
      const digit = Number(char);
      // Always forward: a smaller digit is reached through the next set of ten.
      const at = cell.position % 10;
      cell.from = from;
      cell.start = now;
      cell.position = digit >= at ? cell.position - at + digit : cell.position - at + 10 + digit;
      const to = `translateY(${-cell.position * STEP}%)`;
      // The resting place is the style itself, so the column stays there once the roll is over.
      cell.strip.style.transform = to;
      cell.roll?.cancel();
      cell.roll = reduced()
        ? undefined
        : cell.strip.animate([{ transform: `translateY(${-from * STEP}%)` }, { transform: to }], { duration: ROLL_MS, easing: `cubic-bezier(${ROLL.join(', ')})` });
    });
  }

  /**
   * Where a column is on screen this moment, in lines. Worked out from the roll it is in rather
   * than read back from the page: reading it forced a layout of the whole interface on almost every
   * frame, since the last digits roll over every frame.
   */
  private shown(cell: Cell, now: number): number {
    const progress = (now - cell.start) / ROLL_MS;
    if (progress >= 1 || reduced()) return cell.position;
    return cell.from + (cell.position - cell.from) * cubicBezier(progress, ROLL);
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
        return { char, node, strip, position, from: position, start: 0 };
      }
      const node = document.createElement('span');
      node.className = 'odo-char';
      node.textContent = char;
      return { char, node, position: 0, from: 0, start: 0 };
    });
    this.root.replaceChildren(...this.cells.map((cell) => cell.node));
  }
}
