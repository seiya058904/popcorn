import { SHOW_SPEEDS, type QualityChoice, type Settings } from '../platform/settings.ts';
import type { LoadError } from '../sim/save.ts';
import { el, setClass } from './dom.ts';
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
      if (event.key === 'Escape' && this.playing) {
        event.preventDefault();
        if (this.isOpen) this.close();
        else this.showPause();
      }
    });
    const button = el('button', 'menu-button', root);
    button.setAttribute('aria-label', '菜单');
    button.dataset.action = 'menu';
    button.innerHTML = '<svg viewBox="0 0 48 48" stroke="currentColor" stroke-width="4" stroke-linecap="round" fill="none"><path d="M10 14h28M10 24h28M10 34h28"/></svg>';
    button.addEventListener('pointerdown', () => this.showPause());
  }

  get isOpen(): boolean {
    return this.veil.classList.contains('is-open');
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
      el('button', 'btn is-glass', row, '设置').addEventListener('pointerdown', () => this.showSettings(false));
      el('button', 'btn is-glass', row, '存档').addEventListener('pointerdown', () => this.showSaves(false));
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
      start.addEventListener('pointerdown', () => {
        this.host.unlockAudio();
        this.playing = true;
        // The fading title must not swallow the player's first clicks.
        title.inert = true;
        const out = title.animate(
          [
            { opacity: 1, transform: 'scale(1)' },
            { opacity: 0, transform: 'scale(1.08)' },
          ],
          { duration: 320, easing: 'ease-in', fill: 'forwards' },
        );
        out.onfinish = () => title.remove();
        resolve();
      });
    });
  }

  /** Skips the title for saved test sessions and captures. */
  startImmediately(): void {
    this.playing = true;
  }

  private open(): void {
    this.panel.replaceChildren();
    this.veil.classList.add('is-open');
    if (this.playing) this.host.setPaused(true);
  }

  close(): void {
    this.veil.classList.remove('is-open');
    if (this.playing) this.host.setPaused(false);
  }

  /** Title bar of a menu page: a back key on the left, the title in the middle. */
  private head(title: string, back: { label: string; action: () => void } | null): void {
    const head = el('div', 'menu-head', this.panel);
    if (back) {
      const button = el('button', 'menu-back', head);
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
      el('span', '', button, back.label);
      button.addEventListener('pointerdown', back.action);
    } else {
      el('span', 'menu-back is-empty', head);
    }
    el('h2', '', head, title);
    el('span', 'menu-back is-empty', head);
  }

  private back(fromPause: boolean): { label: string; action: () => void } {
    return fromPause ? { label: '返回', action: () => this.showPause() } : { label: '关闭', action: () => this.close() };
  }

  /** A titled group of rows, like a section of a settings screen. */
  private group(title: string | null): HTMLElement {
    if (title) el('h3', 'menu-group-title', this.panel, title);
    return el('div', 'menu-group', this.panel);
  }

  showPause(): void {
    this.open();
    this.head('暂停一下', null);
    el('p', 'menu-sub', this.panel, '锅还在，爆米花也不会跑。');
    el('button', 'btn is-large menu-resume', this.panel, '继续').addEventListener('pointerdown', () => this.close());
    const list = this.group(null);
    list.classList.add('menu-list');
    const add = (label: string, action: () => void): void => {
      const item = el('button', 'menu-item', list);
      el('span', '', item, label);
      item.insertAdjacentHTML('beforeend', '<svg class="menu-chevron" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>');
      item.addEventListener('pointerdown', action);
    };
    add('成就', () => {
      this.close();
      this.host.showAchievements();
    });
    add('设置', () => this.showSettings(true));
    add('存档管理', () => this.showSaves(true));
  }

  private slider(parent: HTMLElement, label: string, get: () => number, set: (value: number) => void): void {
    const row = el('label', 'menu-row', parent);
    el('span', 'menu-label', row, label);
    const input = el('input', 'slider', row);
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.value = String(Math.round(get() * 100));
    input.setAttribute('aria-label', label);
    const paint = (): void => input.style.setProperty('--value', `${input.value}%`);
    paint();
    input.addEventListener('input', () => {
      set(Number(input.value) / 100);
      paint();
      this.host.settingsChanged();
    });
  }

  private chips<T>(parent: HTMLElement, label: string, options: ReadonlyArray<readonly [T, string]>, get: () => T, set: (value: T) => void): void {
    const row = el('div', 'menu-row', parent);
    el('span', 'menu-label', row, label);
    const group = el('div', 'seg is-small menu-chips', row);
    group.style.setProperty('--count', String(options.length));
    el('i', 'seg-thumb', group);
    const buttons = options.map(([value, text]) => {
      const button = el('button', 'seg-item menu-chip', group, text);
      button.addEventListener('pointerdown', () => {
        set(value);
        this.host.settingsChanged();
        refresh();
      });
      return { button, value };
    });
    const refresh = (): void => {
      group.style.setProperty('--index', String(Math.max(0, options.findIndex(([value]) => value === get()))));
      buttons.forEach(({ button, value }) => setClass(button, 'is-active', value === get()));
    };
    refresh();
  }

  /** An on/off switch: the thumb sits on the right, on a green track, when it is on. */
  private toggle(parent: HTMLElement, label: string, get: () => boolean, set: (value: boolean) => void): void {
    const row = el('div', 'menu-row', parent);
    el('span', 'menu-label', row, label);
    const button = el('button', 'switch', row);
    button.setAttribute('role', 'switch');
    button.setAttribute('aria-label', label);
    el('i', 'switch-thumb', button);
    const refresh = (): void => {
      button.setAttribute('aria-checked', String(get()));
      setClass(button, 'is-on', get());
    };
    button.addEventListener('pointerdown', () => {
      set(!get());
      this.host.settingsChanged();
      refresh();
    });
    refresh();
  }

  showSettings(fromPause: boolean): void {
    this.open();
    const s = this.host.settings;
    this.head('设置', this.back(fromPause));
    const sound = this.group('声音');
    this.slider(sound, '总音量', () => s.master, (v) => (s.master = v));
    this.slider(sound, '音乐', () => s.music, (v) => (s.music = v));
    this.slider(sound, '音效', () => s.effects, (v) => (s.effects = v));
    const picture = this.group('画面');
    this.chips(picture, '画质', QUALITY_LABELS, () => s.quality, (v) => (s.quality = v));
    this.chips(picture, '演出速度', SHOW_SPEEDS.map((v) => [v, `${v}×`] as const), () => s.showSpeed, (v) => (s.showSpeed = v));
    const comfort = this.group('舒适');
    this.toggle(comfort, '减少镜头运动', () => s.reduceMotion, (v) => (s.reduceMotion = v));
    this.toggle(comfort, '屏幕震动', () => s.screenShake, (v) => (s.screenShake = v));
    const language = this.group('语言');
    this.chips(language, '语言', [['zh-CN', '简体中文']] as const, () => s.language, (v) => (s.language = v));
  }

  showSaves(fromPause: boolean): void {
    this.open();
    this.head('存档管理', this.back(fromPause));
    el('p', 'menu-sub', this.panel, '游戏会自动保存。导出的文本可以在其他浏览器里导入。');
    const box = el('textarea', 'menu-text', this.panel);
    box.spellcheck = false;
    box.placeholder = '在这里粘贴存档文本，然后点“导入”。';
    box.setAttribute('aria-label', '存档文本');
    const status = el('p', 'menu-status', this.panel);
    const row = el('div', 'menu-actions', this.panel);
    const add = (label: string, quiet: boolean, action: () => void): HTMLButtonElement => {
      const button = el('button', `btn${quiet ? ' is-quiet' : ''}`, row, label);
      button.addEventListener('pointerdown', action);
      return button;
    };
    add('导出', false, () => {
      box.value = this.host.exportSave();
      box.select();
      void navigator.clipboard?.writeText(box.value).then(
        () => (status.textContent = '存档已复制到剪贴板。'),
        () => (status.textContent = '存档已显示在上方，可以手动复制。'),
      );
      status.textContent = '存档已显示在上方。';
    }).dataset.action = 'export';
    add('下载文件', true, () => {
      const url = URL.createObjectURL(new Blob([this.host.exportSave()], { type: 'text/plain' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'popcorn-save.txt';
      link.click();
      URL.revokeObjectURL(url);
    });
    add('导入', true, () => {
      void this.host.importSave(box.value).then((error) => {
        if (error) status.textContent = LOAD_ERRORS[error];
        else this.host.reload();
      });
    }).dataset.action = 'import';
    // The one thing here that cannot be undone sits apart, in red.
    const danger = el('div', 'menu-danger', this.panel);
    let armed = false;
    const wipe = el('button', 'btn is-quiet is-danger', danger, '清空存档');
    wipe.addEventListener('pointerdown', () => {
      if (!armed) {
        armed = true;
        wipe.textContent = '再点一次确认清空';
        status.textContent = '清空后无法恢复，包括成就和图鉴。';
        return;
      }
      void this.host.wipeSave().then(() => this.host.reload());
    });
    wipe.dataset.action = 'wipe';
  }
}
