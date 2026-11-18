import { ACHIEVEMENTS } from '../content/achievements.ts';
import { formatAmount } from '../content/format.ts';
import { CREDITS, NEWS_LINES } from '../content/news.ts';
import { STAGES } from '../content/stages.ts';
import type { EventBus } from '../events/bus.ts';
import type { GameEvents } from '../events/game-events.ts';
import { easeOutCubic } from '../motion/ease.ts';
import { tuning } from '../motion/tuning.ts';
import type { Simulation } from '../sim/simulation.ts';
import { el, setClass, Text } from './dom.ts';
import './game.css';
import { CannonGauge, type GaugeHooks } from './gauge.ts';
import { ICONS } from './icons.ts';
import { Shop } from './shop.ts';

const FLOAT_POOL = 24;
const SHOP_REFRESH_SECONDS = 0.1;
const TOAST_MS = 4200;
const MAX_TOASTS = 3;

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`;
  return `${Math.max(1, minutes)} 分钟`;
}

export class Hud {
  readonly shop: Shop;
  readonly gauge: CannonGauge;
  private readonly sim: Simulation;
  private readonly root: HTMLElement;
  private readonly countNode: HTMLElement;
  private readonly count: Text;
  private readonly rate: Text;
  private readonly frenzy: HTMLElement;
  private readonly hopperCall: HTMLElement;
  private readonly frenzyText: Text;
  private readonly stageLabel: Text;
  private readonly stageGoal: Text;
  private readonly stageFill: HTMLElement;
  private readonly stageDots: HTMLElement[] = [];
  private readonly hint: HTMLElement;
  private readonly floats: HTMLElement[] = [];
  private readonly toasts: HTMLElement;
  private readonly news: HTMLElement;
  private readonly newsText: Text;
  private newsIndex = 0;
  private newsTimer = 2;
  private readonly slate: HTMLElement;
  private readonly skip: HTMLElement;
  /** Set by the game: jumps past the current breakout show. */
  onSkip: (() => void) | null = null;
  private readonly veil: HTMLElement;
  private readonly dialog: HTMLElement;
  private cinematic = false;
  private floatCursor = 0;
  private shopTimer = 0;
  private shown = 0;
  private lastProgress = -1;

  constructor(root: HTMLElement, sim: Simulation, bus: EventBus<GameEvents>, gaugeHooks: GaugeHooks) {
    this.root = root;
    this.sim = sim;

    const marquee = el('div', 'marquee', root);
    this.countNode = el('span', 'marquee-count num', marquee);
    this.countNode.dataset.counter = 'popcorn';
    this.count = new Text(this.countNode);
    const rateRow = el('div', 'marquee-rate', marquee);
    el('span', '', rateRow, '爆米花 · 每秒');
    this.rate = new Text(el('span', 'num', rateRow));

    this.frenzy = el('div', 'frenzy', root);
    this.frenzyText = new Text(this.frenzy);
    this.hopperCall = el('div', 'hopper-call', root, '跳跳粒出现了，快点它！');

    const stagebar = el('div', 'stagebar', root);
    const label = el('div', 'stagebar-label', stagebar);
    this.stageLabel = new Text(el('span', '', label));
    this.stageGoal = new Text(el('span', 'num', label));
    this.stageFill = el('div', 'stagebar-fill', el('div', 'stagebar-track', stagebar));
    const dots = el('div', 'stagebar-dots', stagebar);
    for (const stage of STAGES) this.stageDots.push(el('span', '', dots, stage.name));

    this.shop = new Shop(root, sim);
    this.gauge = new CannonGauge(root, sim, gaugeHooks);
    this.hint = el('div', 'hint', root, '点一下锅里的玉米');

    for (let i = 0; i < FLOAT_POOL; i += 1) this.floats.push(el('div', 'float num', root));
    this.toasts = el('div', 'toasts', root);

    const corner = el('div', 'corner', root);
    const trophy = el('button', '', corner);
    trophy.innerHTML = ICONS.trophy;
    trophy.setAttribute('aria-label', '成就');
    trophy.addEventListener('pointerdown', () => this.showAchievements());

    this.news = el('div', 'news', root);
    const screen = el('div', 'news-screen', this.news);
    el('b', '', screen, '爆米花新闻');
    this.newsText = new Text(el('p', '', screen));
    el('i', 'news-knob', this.news);
    el('i', 'news-knob is-low', this.news);
    this.slate = el('div', 'slate', root);
    this.skip = el('button', 'skip', root, '跳过 ▶');
    this.skip.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      this.onSkip?.();
    });

    this.veil = el('div', 'dialog-veil', root);
    this.dialog = el('div', 'dialog', this.veil);
    this.veil.addEventListener('pointerdown', (event) => {
      if (event.target === this.veil) this.closeDialog();
    });

    bus.on('achievement_unlocked', ({ id }) => {
      const def = ACHIEVEMENTS.find((achievement) => achievement.id === id);
      if (def) this.toast(ICONS.trophy, def.name, def.blurb);
    });
    bus.on('stage_broken', ({ stage }) => {
      const def = STAGES[stage]!;
      this.toast(ICONS.unit, def.breakLine, def.rewardText);
    });
    this.shown = sim.state.popcorn;
  }

  /** Fraction of the window width covered by the shop, used to center the action. */
  get shopInset(): number {
    if (this.cinematic) return 0;
    return (this.shop.root.offsetWidth + 16) / Math.max(1, window.innerWidth);
  }

  floatGain(x: number, y: number, gain: number): void {
    const float = this.floats[this.floatCursor]!;
    this.floatCursor = (this.floatCursor + 1) % FLOAT_POOL;
    float.textContent = `+${formatAmount(gain)}`;
    float.getAnimations().forEach((animation) => animation.cancel());
    const at = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    float.animate(
      [
        { transform: `${at} scale(0.5)`, opacity: 0 },
        { transform: `${at} translateY(-2.4rem) scale(1.18)`, opacity: 1, offset: 0.14 },
        { transform: `${at} translateY(-4rem) scale(1)`, opacity: 1, offset: 0.45 },
        { transform: `${at} translateY(-8rem) scale(0.92)`, opacity: 0 },
      ],
      { duration: 680, easing: 'cubic-bezier(.2,.7,.3,1)' },
    );
  }

  popCounter(strength = 1): void {
    this.countNode.getAnimations().forEach((animation) => animation.cancel());
    const scale = 1 + (tuning.counterPopScale - 1) * strength;
    this.countNode.animate([{ transform: `scale(${scale})` }, { transform: 'scale(1)' }], {
      duration: tuning.counterPopMs,
      easing: 'ease-out',
    });
  }

  toast(icon: string, title: string, body: string): void {
    while (this.toasts.childElementCount >= MAX_TOASTS) this.toasts.firstElementChild!.remove();
    const toast = el('div', 'toast', this.toasts);
    el('span', '', toast).innerHTML = icon;
    const text = el('div', '', toast);
    el('b', '', text, title);
    el('small', '', text, body);
    toast.animate(
      [
        { transform: 'translateX(-40rem)' },
        { transform: 'translateX(1rem)', offset: 0.75 },
        { transform: 'translateX(0)' },
      ],
      { duration: 340, easing: 'cubic-bezier(.2,.8,.3,1)' },
    );
    window.setTimeout(() => {
      const out = toast.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateX(-4rem)' }], { duration: 220 });
      out.onfinish = () => toast.remove();
    }, TOAST_MS);
  }

  /** The scene title that lands as a breakout settles. */
  showSlate(stage: number): void {
    const def = STAGES[stage];
    if (!def) return;
    this.slate.textContent = def.name;
    this.slate.getAnimations().forEach((animation) => animation.cancel());
    this.slate.animate(
      [
        { opacity: 0, transform: 'translate(-50%, -50%) scale(1.5)', letterSpacing: '1.4em' },
        { opacity: 1, transform: 'translate(-50%, -50%) scale(1)', letterSpacing: '0.3em', offset: 0.14 },
        { opacity: 1, transform: 'translate(-50%, -50%) scale(0.98)', letterSpacing: '0.34em', offset: 0.78 },
        { opacity: 0, transform: 'translate(-50%, -62%) scale(0.98)', letterSpacing: '0.36em' },
      ],
      { duration: 1900, easing: 'cubic-bezier(.2,.8,.3,1)' },
    );
  }

  /** Keeps the interface off the title screen. */
  setHidden(hidden: boolean): void {
    setClass(this.root, 'is-title', hidden);
  }

  /** Clears the screen for the ending; only the skip button stays. */
  setCinematic(on: boolean): void {
    this.cinematic = on;
    setClass(this.root, 'is-cinematic', on);
  }

  setSkipVisible(visible: boolean): void {
    setClass(this.skip, 'is-on', visible);
  }

  private openDialog(narrow: boolean): HTMLElement {
    this.dialog.className = `dialog${narrow ? ' is-narrow' : ''}`;
    this.dialog.replaceChildren();
    this.veil.classList.add('is-open');
    return this.dialog;
  }

  closeDialog(): void {
    this.veil.classList.remove('is-open');
  }

  showOffline(seconds: number, gained: number): void {
    const dialog = this.openDialog(true);
    el('h2', '', dialog, '欢迎回来');
    el('p', '', dialog, `你离开的 ${formatDuration(seconds)}里，锅一直没停。`);
    el('p', 'big num', dialog, `+${formatAmount(gained)}`);
    el('button', 'btn', dialog, '收下').addEventListener('pointerdown', () => this.closeDialog());
  }

  showCredits(onRestart: () => void): void {
    const s = this.sim.state;
    const minutes = Math.round(s.stats.playSeconds / 60);
    const dialog = this.openDialog(true);
    dialog.classList.add('is-credits');
    el('h2', '', dialog, '月亮是一粒玉米');
    el('p', '', dialog, '然后，有人把地球当零食拿走了。');
    const list = el('dl', 'credits', dialog);
    for (const [role, name] of CREDITS) {
      el('dt', '', list, role);
      el('dd', '', list, name);
    }
    el('p', 'credits-stats', dialog, `本锅用时 ${minutes} 分钟 · 点击 ${formatAmount(s.stats.clicks)} 次 · 累计爆出 ${formatAmount(s.totalEarned)}`);
    el('p', 'credits-stats', dialog, '再来一锅：从头开始，永久产量 +25%，图鉴和成就保留，并解锁新的锅。');
    const restart = el('button', 'btn', dialog, '再来一锅');
    restart.dataset.action = 'restart';
    restart.addEventListener('pointerdown', () => onRestart());
    el('button', 'btn is-quiet', dialog, '再看一会儿').addEventListener('pointerdown', () => this.closeDialog());
  }

  showNotice(title: string, body: string): void {
    const dialog = this.openDialog(true);
    el('h2', '', dialog, title);
    el('p', '', dialog, body);
    el('button', 'btn', dialog, '知道了').addEventListener('pointerdown', () => this.closeDialog());
  }

  showAchievements(): void {
    const dialog = this.openDialog(false);
    const earned = new Set(this.sim.state.legacy.achievements);
    el('h2', '', dialog, `成就 ${earned.size} / ${ACHIEVEMENTS.length}`);
    const grid = el('div', 'achievement-grid', dialog);
    for (const def of ACHIEVEMENTS) {
      const got = earned.has(def.id);
      const card = el('div', `achievement${got ? '' : ' is-locked'}`, grid);
      el('b', '', card, got ? def.name : '？？？');
      el('small', '', card, got ? def.blurb : '还没发生。');
    }
    el('button', 'btn is-quiet', dialog, '关闭').addEventListener('pointerdown', () => this.closeDialog());
  }

  update(deltaSeconds: number, pendingGain: number): void {
    const sim = this.sim;
    const target = Math.max(0, sim.state.popcorn - pendingGain);
    // The counter rolls toward the true value instead of jumping.
    const gap = target - this.shown;
    this.shown = Math.abs(gap) < 0.5 ? target : this.shown + gap * easeOutCubic(Math.min(1, deltaSeconds * 16));
    this.count.set(formatAmount(this.shown));
    this.rate.set(formatAmount(sim.perSecond));

    const frenzy = sim.state.frenzy;
    setClass(this.frenzy, 'is-on', frenzy > 0);
    if (frenzy > 0) this.frenzyText.set(`狂热 ×5 · ${Math.ceil(frenzy)} 秒`);
    setClass(this.hopperCall, 'is-on', sim.hopperActive);
    setClass(this.hint, 'is-gone', sim.state.stats.clicks > 0);

    const index = Math.min(sim.state.stage, STAGES.length - 1);
    const stage = STAGES[index]!;
    this.stageLabel.set(sim.state.ended ? '全世界都是爆米花' : `当前：${stage.name}`);
    this.stageGoal.set(sim.state.ended ? '' : `再爆 ${formatAmount(Math.max(0, stage.threshold - sim.state.totalEarned))}`);
    const progress = Math.round(sim.stageProgress * 400) / 400;
    if (progress !== this.lastProgress) {
      this.lastProgress = progress;
      this.stageFill.style.transform = `scaleX(${progress})`;
    }
    this.stageDots.forEach((dot, i) => {
      setClass(dot, 'is-done', i < sim.state.stage);
      setClass(dot, 'is-now', i === sim.state.stage);
    });

    const lines = NEWS_LINES[Math.min(sim.state.stage, 4)];
    setClass(this.news, 'is-on', Boolean(lines));
    if (lines) {
      this.newsTimer -= deltaSeconds;
      if (this.newsTimer <= 0) {
        this.newsTimer = 7.5;
        this.newsText.set(lines[this.newsIndex % lines.length]!);
        this.newsIndex += 1;
      }
    }

    this.gauge.update(deltaSeconds);
    this.shopTimer -= deltaSeconds;
    if (this.shopTimer <= 0) {
      this.shopTimer = SHOP_REFRESH_SECONDS;
      this.shop.update();
    }
  }
}
