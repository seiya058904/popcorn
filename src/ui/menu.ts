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
      const logo = el('h1', 'title-logo', title);
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
      el('p', 'title-line', title, '从一粒玉米开始，一路爆到月亮。');
      const start = el('button', 'btn title-start', title, hasProgress ? '继续这一锅' : '开锅');
      start.dataset.action = 'start';
      const row = el('div', 'title-row', title);
      el('button', 'btn is-quiet', row, '设置').addEventListener('pointerdown', () => this.showSettings(false));
      el('button', 'btn is-quiet', row, '存档').addEventListener('pointerdown', () => this.showSaves(false));
      el('p', 'title-hint', title, '点击或按住爆玉米 · 按住空格或压力表开炮 · Esc 打开菜单');
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

  showPause(): void {
    this.open();
    el('h2', '', this.panel, '暂停一下');
    el('p', '', this.panel, '锅还在，爆米花也不会跑。');
    const list = el('div', 'menu-list', this.panel);
    const add = (label: string, action: () => void): void => {
      el('button', 'btn', list, label).addEventListener('pointerdown', action);
    };
    add('继续', () => this.close());
    add('成就', () => {
      this.close();
      this.host.showAchievements();
    });
    add('设置', () => this.showSettings(true));
    add('存档管理', () => this.showSaves(true));
  }

  private backRow(fromPause: boolean): void {
    const row = el('div', 'menu-list', this.panel);
    el('button', 'btn is-quiet', row, fromPause ? '返回' : '关闭').addEventListener('pointerdown', () => {
      if (fromPause) this.showPause();
      else this.close();
    });
  }

  private slider(parent: HTMLElement, label: string, get: () => number, set: (value: number) => void): void {
    const row = el('label', 'menu-row', parent);
    el('span', '', row, label);
    const input = el('input', '', row);
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.value = String(Math.round(get() * 100));
    input.setAttribute('aria-label', label);
    input.addEventListener('input', () => {
      set(Number(input.value) / 100);
      this.host.settingsChanged();
    });
  }

  private chips<T>(parent: HTMLElement, label: string, options: ReadonlyArray<readonly [T, string]>, get: () => T, set: (value: T) => void): void {
    const row = el('div', 'menu-row', parent);
    el('span', '', row, label);
    const group = el('div', 'menu-chips', row);
    const buttons = options.map(([value, text]) => {
      const button = el('button', 'menu-chip', group, text);
      button.addEventListener('pointerdown', () => {
        set(value);
        this.host.settingsChanged();
        refresh();
      });
      return { button, value };
    });
    const refresh = (): void => buttons.forEach(({ button, value }) => setClass(button, 'is-active', value === get()));
    refresh();
  }

  private toggle(parent: HTMLElement, label: string, get: () => boolean, set: (value: boolean) => void): void {
    this.chips(parent, label, [[true, '开'], [false, '关']] as const, get, set);
  }

  showSettings(fromPause: boolean): void {
    this.open();
    const s = this.host.settings;
    el('h2', '', this.panel, '设置');
    const form = el('div', 'menu-form', this.panel);
    this.slider(form, '总音量', () => s.master, (v) => (s.master = v));
    this.slider(form, '音乐', () => s.music, (v) => (s.music = v));
    this.slider(form, '音效', () => s.effects, (v) => (s.effects = v));
    this.chips(form, '画质', QUALITY_LABELS, () => s.quality, (v) => (s.quality = v));
    this.chips(form, '演出速度', SHOW_SPEEDS.map((v) => [v, `${v}×`] as const), () => s.showSpeed, (v) => (s.showSpeed = v));
    this.toggle(form, '减少镜头运动', () => s.reduceMotion, (v) => (s.reduceMotion = v));
    this.toggle(form, '屏幕震动', () => s.screenShake, (v) => (s.screenShake = v));
    this.chips(form, '语言', [['zh-CN', '简体中文']] as const, () => s.language, (v) => (s.language = v));
    this.backRow(fromPause);
  }

  showSaves(fromPause: boolean): void {
    this.open();
    el('h2', '', this.panel, '存档管理');
    el('p', '', this.panel, '游戏会自动保存。导出的文本可以在其他浏览器里导入。');
    const box = el('textarea', 'menu-text', this.panel);
    box.spellcheck = false;
    box.placeholder = '在这里粘贴存档文本，然后点“导入”。';
    box.setAttribute('aria-label', '存档文本');
    const status = el('p', 'menu-status', this.panel);
    const row = el('div', 'menu-list is-row', this.panel);
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
    add('导入', false, () => {
      void this.host.importSave(box.value).then((error) => {
        if (error) status.textContent = LOAD_ERRORS[error];
        else this.host.reload();
      });
    }).dataset.action = 'import';
    let armed = false;
    const wipe = add('清空存档', true, () => {
      if (!armed) {
        armed = true;
        wipe.textContent = '再点一次确认清空';
        status.textContent = '清空后无法恢复，包括成就和图鉴。';
        return;
      }
      void this.host.wipeSave().then(() => this.host.reload());
    });
    wipe.dataset.action = 'wipe';
    this.backRow(fromPause);
  }
}
