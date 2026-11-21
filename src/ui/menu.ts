import { SHOW_SPEEDS, type QualityChoice, type Settings } from '../platform/settings.ts';
import type { LoadError } from '../sim/save.ts';
import { el, setClass } from './dom.ts';
import { feedback } from './feedback.ts';
import { glide, MOTION, motionPrefs, play } from './motion.ts';
import { pressable } from './press.ts';
import { Segmented } from './segmented.ts';
import { closeSheet, isSheetOpen, openSheet } from './sheet.ts';
import './menu.css';

export interface MenuHost {
  readonly settings: Settings;
  settingsChanged(): void;
  setPaused(paused: boolean): void;
  showAchievements(): void;
  exportSave(): string;
  importSave(text: string): Promise<LoadError | null>;
  wipeSave(): Promise<void>;
  reload(): void;
  unlockAudio(): void;
  /** Hands the screen over to photo mode. */
  enterPhoto(): void;
}

const LOAD_ERRORS: Record<LoadError, string> = {
  'not-json': '这不是有效的存档内容。',
  'wrong-format': '这不是《砰！爆米花失控了》的存档。',
  'bad-checksum': '存档内容不完整，或者被改动过。',
  'future-version': '这份存档来自更新的版本。',
  'invalid-data': '存档里的数据无法读取。',
};

const QUALITY_LABELS: ReadonlyArray<readonly [QualityChoice, string]> = [
  ['auto', '自动'],
  ['low', '低'],
  ['medium', '中'],
  ['high', '高'],
  ['ultra', '极高'],
];

const CHEVRON_BACK = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
const CHEVRON = '<svg class="menu-chevron" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>';
/** How long "clear save" has to be held, so it never happens by accident. */
const WIPE_HOLD_MS = 1200;

type Direction = 'push' | 'pop';

/** Title screen, pause menu, settings and save management. */
export class Menus {
  private readonly host: MenuHost;
  private readonly veil: HTMLElement;
  private readonly panel: HTMLElement;
  private playing = false;

  constructor(root: HTMLElement, host: MenuHost) {
    this.host = host;
    this.veil = el('div', 'dialog-veil menu-veil', root);
    this.panel = el('div', 'dialog menu', this.veil);
    this.veil.addEventListener('pointerdown', (event) => {
      if (event.target === this.veil) this.close();
    });
    window.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (this.isOpen) {
        event.preventDefault();
        this.close();
      } else if (this.playing) {
        event.preventDefault();
        this.showPause();
      }
    });
    const button = el('button', 'menu-button', root);
    button.setAttribute('aria-label', '菜单');
    button.dataset.action = 'menu';
    button.innerHTML = '<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="4" stroke-linecap="round" fill="none"><path d="M10 14h28M10 24h28M10 34h28"/></svg>';
    pressable(button, { scale: 0.9, action: () => this.showPause() });
  }

  get isOpen(): boolean {
    return isSheetOpen(this.veil);
  }

  /** Resolves when the player chooses to start. */
  showTitle(root: HTMLElement, hasProgress: boolean): Promise<void> {
    return new Promise((resolve) => {
      const title = el('div', 'title', root);
      const stack = el('div', 'title-stack', title);
      const logo = el('h1', 'title-logo', stack);
      const big = el('span', 'title-pop', logo);
      for (const [index, char] of [...'砰！'].entries()) {
        const letter = el('span', '', big, char);
        letter.style.animationDelay = `${0.1 + index * 0.09}s`;
      }
      const rest = el('span', 'title-rest', logo);
      for (const [index, char] of [...'爆米花失控了'].entries()) {
        const letter = el('span', '', rest, char);
        letter.style.animationDelay = `${0.32 + index * 0.05}s`;
      }
      el('p', 'title-line', stack, '从一粒玉米开始，一路爆到月亮。');
      const start = el('button', 'btn is-large title-start', stack, hasProgress ? '继续这一锅' : '开锅');
      start.dataset.action = 'start';
      const row = el('div', 'title-row', stack);
      pressable(el('button', 'btn is-glass', row, '设置'), { action: () => this.showSettings(false) });
      pressable(el('button', 'btn is-glass', row, '存档'), { action: () => this.showSaves(false) });
      // The controls, each with the key or action it needs shown as a little key cap.
      const hints = el('div', 'title-hints', stack);
      for (const [key, text] of [
        ['点击', '爆玉米，按住连爆'],
        ['空格', '按住蓄压，松手开炮'],
        ['Esc', '菜单'],
      ] as const) {
        const hint = el('span', 'title-hint', hints);
        el('kbd', '', hint, key);
        el('span', '', hint, text);
      }
      // The entrance: the column rises in after the logo letters have landed.
      for (const [index, node] of [stack.querySelector('.title-line'), start, row, hints].entries()) {
        play(node as HTMLElement, [{ opacity: 0, transform: 'translateY(1.2rem)' }, { opacity: 1, transform: 'none' }], { ...MOTION.appear, duration: MOTION.appear.duration + index * 90 });
      }
      pressable(start, {
        action: () => {
          this.host.unlockAudio();
          this.playing = true;
          // The fading title must not swallow the player's first clicks.
          title.inert = true;
          const out = title.animate(
            [
              { opacity: 1, transform: 'scale(1)' },
              { opacity: 0, transform: motionPrefs.reduced ? 'scale(1)' : 'scale(1.06)' },
            ],
            { duration: 360, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'forwards' },
          );
          out.onfinish = () => title.remove();
          resolve();
        },
      });
    });
  }

  /** Skips the title for saved test sessions and captures. */
  startImmediately(): void {
    this.playing = true;
  }

  /**
   * Shows a page. Opening rises in; moving between pages slides the new one in from the right
   * (going deeper) or the left (going back), while the card eases to its new height.
   */
  private page(direction: Direction, build: () => void): void {
    const wasOpen = this.isOpen;
    const before = wasOpen ? this.panel.getBoundingClientRect().height : 0;
    this.panel.replaceChildren();
    build();
    openSheet(this.veil, this.panel);
    if (this.playing) this.host.setPaused(true);
    if (!wasOpen) return;
    feedback.select();
    if (motionPrefs.reduced) {
      play(this.panel, [{ opacity: 0.4 }, { opacity: 1 }], MOTION.fade);
      return;
    }
    const after = this.panel.getBoundingClientRect().height;
    if (Math.abs(after - before) > 1) {
      this.panel.animate([{ height: `${before}px`, overflow: 'hidden' }, { height: `${after}px`, overflow: 'hidden' }], { duration: MOTION.slide.duration, easing: MOTION.slide.easing });
    }
    const shift = direction === 'push' ? 4 : -4;
    for (const child of this.panel.children) {
      play(child as HTMLElement, [{ opacity: 0, transform: `translateX(${shift}rem)` }, { opacity: 1, transform: 'none' }], MOTION.fade);
    }
  }

  close(): void {
    closeSheet(this.veil, this.panel);
    if (this.playing) this.host.setPaused(false);
  }

  /** Title bar of a menu page: a back key on the left, the title in the middle. */
  private head(title: string, back: { label: string; action: () => void } | null): void {
    const head = el('div', 'menu-head', this.panel);
    if (back) {
      const button = el('button', 'menu-back', head);
      button.innerHTML = CHEVRON_BACK;
      el('span', '', button, back.label);
      pressable(button, { scale: 0.94, action: back.action });
    } else {
      el('span', 'menu-back is-empty', head);
    }
    el('h2', '', head, title);
    el('span', 'menu-back is-empty', head);
  }

  private back(fromPause: boolean): { label: string; action: () => void } {
    return fromPause ? { label: '返回', action: () => this.showPause('pop') } : { label: '关闭', action: () => this.close() };
  }

  /** A titled group of rows, like a section of a settings screen. */
  private group(title: string | null): HTMLElement {
    if (title) el('h3', 'menu-group-title', this.panel, title);
    return el('div', 'menu-group', this.panel);
  }

  showPause(direction: Direction = 'pop'): void {
    this.page(direction, () => {
      this.head('暂停一下', null);
      el('p', 'menu-sub', this.panel, '锅还在，爆米花也不会跑。');
      pressable(el('button', 'btn is-large menu-resume', this.panel, '继续'), { scale: 0.98, action: () => this.close() });
      const list = this.group(null);
      list.classList.add('menu-list');
      const add = (label: string, action: () => void): void => {
        const item = el('button', 'menu-item', list);
        el('span', '', item, label);
        item.insertAdjacentHTML('beforeend', CHEVRON);
        // A row darkens under the finger rather than shrinking, as list rows do.
        pressable(item, { scale: 1, action });
      };
      add('拍照模式', () => {
        this.close();
        this.host.enterPhoto();
      });
      add('成就', () => {
        this.close();
        this.host.showAchievements();
      });
      add('设置', () => this.showSettings(true));
      add('存档管理', () => this.showSaves(true));
    });
  }

  /** A slider: the thumb grows under the finger, a bubble shows the value, and each tenth ticks. */
  private slider(parent: HTMLElement, label: string, get: () => number, set: (value: number) => void): void {
    const row = el('label', 'menu-row', parent);
    el('span', 'menu-label', row, label);
    const wrap = el('span', 'slider-wrap', row);
    const input = el('input', 'slider', wrap);
    const bubble = el('span', 'slider-bubble num', wrap);
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.value = String(Math.round(get() * 100));
    input.setAttribute('aria-label', label);
    let tenth = Math.floor(Number(input.value) / 10);
    const paint = (): void => {
      wrap.style.setProperty('--value', `${input.value}%`);
      wrap.style.setProperty('--fraction', String(Number(input.value) / 100));
      bubble.textContent = input.value;
    };
    paint();
    input.addEventListener('input', () => {
      set(Number(input.value) / 100);
      paint();
      const now = Math.floor(Number(input.value) / 10);
      if (now !== tenth) {
        tenth = now;
        feedback.tick(Number(input.value) / 100);
      }
      this.host.settingsChanged();
    });
    const lift = (on: boolean) => () => setClass(wrap, 'is-dragging', on);
    input.addEventListener('pointerdown', lift(true));
    for (const type of ['pointerup', 'pointercancel', 'blur'] as const) input.addEventListener(type, lift(false));
  }

  private chips<T>(parent: HTMLElement, label: string, options: ReadonlyArray<readonly [T, string]>, get: () => T, set: (value: T) => void): void {
    const row = el('div', 'menu-row', parent);
    el('span', 'menu-label', row, label);
    const control = new Segmented(
      row,
      'is-small menu-chips',
      options.map(([, text]) => text),
      (index) => {
        set(options[index]![0]);
        this.host.settingsChanged();
      },
      (button, text) => {
        button.classList.add('menu-chip');
        button.textContent = text;
      },
    );
    control.select(Math.max(0, options.findIndex(([value]) => value === get())), false);
  }

  /** An on/off switch: the thumb slides on a spring, the track turns green, and it clicks. */
  private toggle(parent: HTMLElement, label: string, get: () => boolean, set: (value: boolean) => void): void {
    const row = el('div', 'menu-row', parent);
    el('span', 'menu-label', row, label);
    const button = el('button', 'switch', row);
    button.setAttribute('role', 'switch');
    button.setAttribute('aria-label', label);
    const thumb = el('i', 'switch-thumb', button);
    const refresh = (): void => {
      button.setAttribute('aria-checked', String(get()));
      setClass(button, 'is-on', get());
    };
    pressable(button, {
      quiet: true,
      scale: 0.94,
      action: () => {
        set(!get());
        feedback.toggle(get());
        glide(thumb, refresh);
        this.host.settingsChanged();
      },
    });
    refresh();
  }

  showSettings(fromPause: boolean): void {
    this.page('push', () => {
      const s = this.host.settings;
      this.head('设置', this.back(fromPause));
      const sound = this.group('声音');
      this.slider(sound, '总音量', () => s.master, (v) => (s.master = v));
      this.slider(sound, '音乐', () => s.music, (v) => (s.music = v));
      this.slider(sound, '音效', () => s.effects, (v) => (s.effects = v));
      this.slider(sound, '界面音效', () => s.ui, (v) => (s.ui = v));
      const picture = this.group('画面');
      this.chips(picture, '画质', QUALITY_LABELS, () => s.quality, (v) => (s.quality = v));
      this.chips(picture, '演出速度', SHOW_SPEEDS.map((v) => [v, `${v}×`] as const), () => s.showSpeed, (v) => (s.showSpeed = v));
      const comfort = this.group('舒适');
      this.toggle(comfort, '减少镜头运动', () => s.reduceMotion, (v) => (s.reduceMotion = v));
      this.toggle(comfort, '屏幕震动', () => s.screenShake, (v) => (s.screenShake = v));
      this.toggle(comfort, '触感反馈', () => s.haptics, (v) => (s.haptics = v));
      const language = this.group('语言');
      this.chips(language, '语言', [['zh-CN', '简体中文']] as const, () => s.language, (v) => (s.language = v));
    });
  }

  showSaves(fromPause: boolean): void {
    this.page('push', () => {
      this.head('存档管理', this.back(fromPause));
      el('p', 'menu-sub', this.panel, '游戏会自动保存。导出的文本可以在其他浏览器里导入。');
      const box = el('textarea', 'menu-text', this.panel);
      box.spellcheck = false;
      box.placeholder = '在这里粘贴存档文本，然后点“导入”。';
      box.setAttribute('aria-label', '存档文本');
      const status = el('p', 'menu-status', this.panel);
      const say = (text: string): void => {
        status.textContent = text;
        play(status, [{ opacity: 0, transform: 'translateY(-0.4rem)' }, { opacity: 1, transform: 'none' }], MOTION.fade);
      };
      const row = el('div', 'menu-actions', this.panel);
      const add = (label: string, quiet: boolean, action: () => boolean | void): HTMLButtonElement => {
        const button = el('button', `btn${quiet ? ' is-quiet' : ''}`, row, label);
        pressable(button, { action });
        return button;
      };
      add('导出', false, () => {
        box.value = this.host.exportSave();
        box.select();
        say('存档已显示在上方。');
        void navigator.clipboard?.writeText(box.value).then(
          () => say('存档已复制到剪贴板。'),
          () => say('存档已显示在上方，可以手动复制。'),
        );
      }).dataset.action = 'export';
      add('下载文件', true, () => {
        const url = URL.createObjectURL(new Blob([this.host.exportSave()], { type: 'text/plain' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'popcorn-save.txt';
        link.click();
        URL.revokeObjectURL(url);
      });
      const importButton = add('导入', true, () => {
        if (!box.value.trim()) {
          say('先把存档文本粘贴到上面。');
          return false;
        }
        // Busy until the save is checked, so a second press cannot start a second import.
        importButton.disabled = true;
        importButton.setAttribute('aria-busy', 'true');
        void this.host.importSave(box.value).then((error) => {
          if (error) {
            importButton.disabled = false;
            importButton.removeAttribute('aria-busy');
            say(LOAD_ERRORS[error]);
            feedback.deny();
          } else this.host.reload();
        });
      });
      importButton.dataset.action = 'import';
      // The one thing here that cannot be undone sits apart, in red, and has to be held.
      const danger = el('div', 'menu-danger', this.panel);
      const wipe = el('button', 'btn is-quiet is-danger is-hold', danger, '按住清空存档');
      wipe.dataset.action = 'wipe';
      pressable(wipe, {
        holdMs: WIPE_HOLD_MS,
        action: () => {
          feedback.heavy();
          void this.host.wipeSave().then(() => this.host.reload());
        },
        onHoldProgress: (progress) => {
          wipe.style.setProperty('--hold', String(progress));
          if (progress > 0 && progress < 1) status.textContent = '清空后无法恢复，包括成就和图鉴。';
        },
      });
    });
  }
}
