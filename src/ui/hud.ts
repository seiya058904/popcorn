import { ACHIEVEMENTS } from '../content/achievements.ts';
import { formatAmount } from '../content/format.ts';
import { CREDITS, NEWS_LINES } from '../content/news.ts';
import { EGGS } from '../content/props.ts';
import { PRODUCERS } from '../content/producers.ts';
import { STAGES } from '../content/stages.ts';
import type { EventBus } from '../events/bus.ts';
import type { GameEvents } from '../events/game-events.ts';
import { easeOutCubic } from '../motion/ease.ts';
import { tuning } from '../motion/tuning.ts';
import { milestoneMultiplier, nextMilestone } from '../sim/economy.ts';
import type { Simulation } from '../sim/simulation.ts';
import { el, setClass, Text } from './dom.ts';
import './game.css';
import { CannonGauge, type GaugeHooks } from './gauge.ts';
import { ICONS, UNIT_ICONS } from './icons.ts';
import { flip, MOTION, play } from './motion.ts';
import { Odometer } from './odometer.ts';
import { pressable } from './press.ts';
import { closeSheet, isSheetOpen, openSheet } from './sheet.ts';
import { Shop } from './shop.ts';

/** What holds the kernels in each scene, for the first hint. */
const HINT_VESSELS = ['锅', '碗', '桶', '喷泉', '火山口'];
/** The first hint retires after this long even if nothing has been clicked or bought. */
const HINT_SECONDS = 120;
/** How long a found thing's line stays up. */
const EGG_BUBBLE_MS = 3200;
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
  private readonly count: Odometer;
  private readonly rate: Text;
  private readonly frenzy: HTMLElement;
  private readonly hopperCall: HTMLElement;
  private readonly hopperCallText: Text;
  private readonly frenzyText: Text;
  private readonly stageLabel: Text;
  private readonly stageGoal: Text;
  private readonly stageFill: HTMLElement;
  private readonly stageDots: HTMLElement[] = [];
  private readonly hint: HTMLElement;
  private readonly hintText: Text;
  /** Seconds of play this session, for retiring the first hint. */
  private playTime = 0;
  private readonly floats: HTMLElement[] = [];
  private readonly toasts: HTMLElement;
  private readonly news: HTMLElement;
  private readonly newsText: Text;
  private newsIndex = 0;
  private newsTimer = 2;
  private readonly slate: HTMLElement;
  /** A band of gold that sweeps across the counter after a golden kernel. */
  private readonly counterGleam: HTMLElement;
  /** A glow round the marquee in the color of the combo tier just reached. */
  private readonly comboRing: HTMLElement;
  /** Beside the pointer when it rests on something that can be tapped. */
  private readonly hoverTag: HTMLElement;
  /** What a found thing has to say, over where it was tapped. */
  private readonly bubble: HTMLElement;
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
    this.count = new Odometer(this.countNode);
    const rateRow = el('div', 'marquee-rate', marquee);
    this.counterGleam = el('span', 'marquee-gleam', marquee);
    this.comboRing = el('span', 'marquee-combo', marquee);
    el('span', '', rateRow, '爆米花 · 每秒');
    this.rate = new Text(el('span', 'num', rateRow));

    this.frenzy = el('div', 'frenzy', root);
    this.frenzyText = new Text(this.frenzy);
    this.hopperCall = el('div', 'hopper-call', root, '跳跳粒出现了，快点它！');
    this.hopperCallText = new Text(this.hopperCall);

    const stagebar = el('div', 'stagebar glass', root);
    const label = el('div', 'stagebar-label', stagebar);
    this.stageLabel = new Text(el('span', '', label));
    this.stageGoal = new Text(el('span', 'num', label));
    this.stageFill = el('div', 'stagebar-fill', el('div', 'stagebar-track', stagebar));
    const dots = el('div', 'stagebar-dots', stagebar);
    for (const stage of STAGES) this.stageDots.push(el('span', '', dots, stage.name));

    this.shop = new Shop(root, sim);
    this.gauge = new CannonGauge(root, sim, gaugeHooks);
    this.hint = el('div', 'hint', root);
    this.hintText = new Text(this.hint);

    for (let i = 0; i < FLOAT_POOL; i += 1) this.floats.push(el('div', 'float num', root));
    this.toasts = el('div', 'toasts', root);

    const corner = el('div', 'corner', root);
    const trophy = el('button', '', corner);
    trophy.innerHTML = ICONS.trophy;
    trophy.setAttribute('aria-label', '成就');
    pressable(trophy, { scale: 0.9, action: () => this.showAchievements() });

    this.news = el('div', 'news', root);
    const screen = el('div', 'news-screen', this.news);
    el('b', '', screen, '爆米花新闻');
    this.newsText = new Text(el('p', '', screen));
    el('i', 'news-knob', this.news);
    el('i', 'news-knob is-low', this.news);
    this.slate = el('div', 'slate', root);
    this.hoverTag = el('div', 'hover-tag', root);
    this.bubble = el('div', 'egg-bubble', root);
    this.skip = el('button', 'skip', root, '跳过 ▶');
    this.skip.addEventListener('pointerdown', (event) => event.stopPropagation());
    pressable(this.skip, { action: () => this.onSkip?.() });

    this.veil = el('div', 'dialog-veil', root);
    this.dialog = el('div', 'dialog', this.veil);
    this.veil.addEventListener('pointerdown', (event) => {
      if (event.target === this.veil) this.closeDialog();
    });
    this.veil.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        this.closeDialog();
      }
    });

    bus.on('achievement_unlocked', ({ id }) => {
      const def = ACHIEVEMENTS.find((achievement) => achievement.id === id);
      if (def) this.toast(ICONS.trophy, def.name, def.blurb);
    });
    bus.on('producer_purchased', ({ producer, owned, quantity, milestone }) => {
      const def = PRODUCERS[producer]!;
      if (owned === quantity && producer > 0) {
        this.toast(UNIT_ICONS[producer]!, `新设备：${def.name}`, `每台每秒 ${formatAmount(sim.derived.unitEach[producer]!)}`);
      } else if (milestone) {
        const jump = milestoneMultiplier(owned) / milestoneMultiplier(owned - quantity);
        const next = nextMilestone(owned);
        this.toast(UNIT_ICONS[producer]!, `${def.name} 达到 ${owned} 台`, `每台产量 ×${jump}。下一次在 ${next.at} 台。`);
      }
    });
    bus.on('stage_broken', ({ stage }) => {
      const def = STAGES[stage]!;
      this.toast(ICONS.unit, def.breakLine, def.rewardText);
    });
    this.shown = sim.state.popcorn;
  }

  /** Whether one of the interface's own sheets (achievements, offline report) is up. */
  get sheetOpen(): boolean {
    return isSheetOpen(this.veil);
  }

  /** Cached shop inset fraction, invalidated only when the window changes size. */
  private cachedShopInset: number | null = null;

  /** Fraction of the window width covered by the shop, used to center the action. */
  get shopInset(): number {
    if (this.cinematic) return 0;
    if (this.cachedShopInset === null) {
      const width = this.shop.root.offsetWidth;
      const value = (width + 16) / Math.max(1, window.innerWidth);
      if (width === 0) return value;
      this.cachedShopInset = value;
      window.addEventListener('resize', () => (this.cachedShopInset = null), { once: true });
    }
    return this.cachedShopInset;
  }

  /**
   * Where floating numbers may start: low enough that their climb stays clear of the counter, and
   * left of the shop. Measured again only when the window changes size.
   */
  private floatBounds: { top: number; right: number } | null = null;

  private boundsForFloats(): { top: number; right: number } {
    if (!this.floatBounds) {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 10;
      const marquee = this.countNode.parentElement!.getBoundingClientRect();
      // The climb is 8rem; the number itself is about 3rem tall.
      this.floatBounds = { top: marquee.bottom + rem * 10, right: this.shop.root.getBoundingClientRect().left - rem * 3 };
      window.addEventListener('resize', () => (this.floatBounds = null), { once: true });
    }
    return this.floatBounds;
  }

  /** A golden kernel's number comes up larger, in gold, and stays a little longer. */
  floatGain(screenX: number, screenY: number, gain: number, golden = false): void {
    const bounds = this.boundsForFloats();
    const x = Math.min(screenX, bounds.right);
    const y = Math.max(screenY, bounds.top);
    const float = this.floats[this.floatCursor]!;
    this.floatCursor = (this.floatCursor + 1) % FLOAT_POOL;
    float.textContent = `+${formatAmount(gain)}`;
    setClass(float, 'is-golden', golden);
    if (golden) {
      this.counterGleam.classList.remove('is-on');
      void this.counterGleam.offsetWidth;
      this.counterGleam.classList.add('is-on');
    }
    float.getAnimations().forEach((animation) => animation.cancel());
    const at = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    const size = golden ? 1.5 : 1;
    float.animate(
      [
        { transform: `${at} scale(${0.5 * size})`, opacity: 0 },
        { transform: `${at} translateY(-2.4rem) scale(${1.18 * size})`, opacity: 1, offset: 0.14 },
        { transform: `${at} translateY(-4rem) scale(${size})`, opacity: 1, offset: 0.45 },
        { transform: `${at} translateY(-8rem) scale(${0.92 * size})`, opacity: 0 },
      ],
      { duration: golden ? 1000 : 680, easing: 'cubic-bezier(.2,.7,.3,1)' },
    );
  }

  /** The marquee flares in the color of a combo tier (1 to 4). */
  comboGlow(tier: number): void {
    this.comboRing.dataset.tier = String(Math.max(1, Math.min(4, tier)));
    this.comboRing.classList.remove('is-on');
    void this.comboRing.offsetWidth;
    this.comboRing.classList.add('is-on');
    this.popCounter(0.4 + tier * 0.15);
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
    // The oldest gives way at once when the stack is full; the rest glide up into the gap.
    const current = [...this.toasts.children] as HTMLElement[];
    if (current.length >= MAX_TOASTS) flip(current, () => current.slice(0, current.length - MAX_TOASTS + 1).forEach((old) => old.remove()));
    const toast = el('div', 'toast', this.toasts);
    el('span', 'toast-icon', toast).innerHTML = icon;
    const text = el('div', '', toast);
    el('b', '', text, title);
    el('small', '', text, body);
    play(toast, [{ opacity: 0, transform: 'translateX(-110%)' }, { opacity: 1, transform: 'none' }], MOTION.appear);
    window.setTimeout(() => {
      if (!toast.isConnected) return;
      const out = toast.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-3rem)' }], { duration: MOTION.exit.duration, easing: MOTION.exit.easing, fill: 'forwards' });
      out.onfinish = () => {
        const rest = ([...this.toasts.children] as HTMLElement[]).filter((node) => node !== toast);
        flip(rest, () => toast.remove());
      };
    }, TOAST_MS);
  }

  /**
   * The scene title that lands as a breakout settles, its letters closing in from wide apart.
   * Each letter moves on its own transform rather than through letter-spacing: spacing is layout,
   * so the huge glowing title was laid out and repainted on every frame of its two seconds.
   */
  showSlate(stage: number): void {
    const def = STAGES[stage];
    if (!def) return;
    const letters = [...def.name];
    this.slate.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
    this.slate.replaceChildren(...letters.map((letter) => el('span', 'slate-letter', undefined, letter)));
    const timing = { duration: 1900, easing: 'cubic-bezier(.2,.8,.3,1)' };
    this.slate.animate(
      [
        { opacity: 0, transform: 'translate(-50%, -50%) scale(1.5)' },
        { opacity: 1, transform: 'translate(-50%, -50%) scale(1)', offset: 0.14 },
        { opacity: 1, transform: 'translate(-50%, -50%) scale(0.98)', offset: 0.78 },
        { opacity: 0, transform: 'translate(-50%, -62%) scale(0.98)' },
      ],
      timing,
    );
    // Extra spacing over the resting 0.3em, as the old letter-spacing keyframes had it.
    const middle = (letters.length - 1) / 2;
    [...this.slate.children].forEach((letter, index) => {
      const away = index - middle;
      (letter as HTMLElement).animate(
        [
          { transform: `translateX(${away * 1.1}em)` },
          { transform: 'translateX(0)', offset: 0.14 },
          { transform: `translateX(${away * 0.04}em)`, offset: 0.78 },
          { transform: `translateX(${away * 0.06}em)` },
        ],
        timing,
      );
    });
  }

  /** The pointer rests on a machine (its name and an invitation), a hidden thing (a hint), or nothing. */
  setHover(target: { kind: 'machine'; unit: number } | { kind: 'egg' } | null): void {
    if (target) this.hoverTag.textContent = target.kind === 'egg' ? '？' : `戳一下 · ${PRODUCERS[target.unit]!.name}`;
    setClass(this.hoverTag, 'is-on', target !== null);
    setClass(this.hoverTag, 'is-egg', target?.kind === 'egg');
  }

  moveHover(x: number, y: number): void {
    this.hoverTag.style.transform = `translate(${x}px, ${y}px)`;
  }

  /** A hidden thing was tapped: it says its line, and the first time it joins the album. */
  eggFound(id: string, first: boolean, x: number, y: number): void {
    const def = EGGS.find((egg) => egg.id === id);
    if (!def) return;
    this.bubble.textContent = def.blurb;
    this.bubble.getAnimations().forEach((animation) => animation.cancel());
    // Over the spot, but never off the screen: a thing near the edge keeps its line in view.
    const margin = 16;
    const half = this.bubble.offsetWidth / 2;
    const left = Math.min(Math.max(x, half + margin), window.innerWidth - half - margin);
    const top = Math.max(y, this.bubble.offsetHeight + margin * 3);
    const at = `translate(${left}px, ${top}px) translate(-50%, -100%)`;
    // It pops up from the spot and floats a little; with reduced motion it only fades.
    const full: Keyframe[] = [
      { transform: `${at} translateY(0.6rem) scale(0.86)`, opacity: 0 },
      { transform: `${at} translateY(-1.6rem) scale(1.04)`, opacity: 1, offset: 0.08 },
      { transform: `${at} translateY(-1.4rem) scale(1)`, opacity: 1, offset: 0.14 },
      { transform: `${at} translateY(-1.8rem) scale(1)`, opacity: 1, offset: 0.86 },
      { transform: `${at} translateY(-2.4rem) scale(0.98)`, opacity: 0 },
    ];
    const still = `${at} translateY(-1.6rem)`;
    const calm: Keyframe[] = [
      { transform: still, opacity: 0 },
      { transform: still, opacity: 1, offset: 0.08 },
      { transform: still, opacity: 1, offset: 0.86 },
      { transform: still, opacity: 0 },
    ];
    const reduced = document.documentElement.dataset.motion === 'reduced';
    this.bubble.animate(reduced ? calm : full, { duration: EGG_BUBBLE_MS, easing: 'cubic-bezier(.2,.7,.3,1)' });
    if (first) this.toast(ICONS.find, `发现彩蛋：${def.name}`, `彩蛋图鉴 ${this.sim.state.legacy.found.length} / ${EGGS.length}`);
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
    openSheet(this.veil, this.dialog);
    return this.dialog;
  }

  closeDialog(): void {
    closeSheet(this.veil, this.dialog);
  }

  /** A dialog button: pressed like every other, it acts on release. */
  private button(parent: HTMLElement, className: string, label: string, action: () => void): HTMLButtonElement {
    const button = el('button', className, parent, label);
    pressable(button, { action });
    return button;
  }

  showOffline(seconds: number, gained: number): void {
    const dialog = this.openDialog(true);
    el('h2', '', dialog, '欢迎回来');
    el('p', '', dialog, `你离开的 ${formatDuration(seconds)}里，锅一直没停。`);
    el('p', 'big num', dialog, `+${formatAmount(gained)}`);
    const actions = el('div', 'dialog-actions', dialog);
    this.button(actions, 'btn', '收下', () => this.closeDialog());
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
    const stats = el('div', 'credits-stats', dialog);
    for (const text of [`用时 ${minutes} 分钟`, `点击 ${formatAmount(s.stats.clicks)} 次`, `累计爆出 ${formatAmount(s.totalEarned)}`]) el('span', '', stats, text);
    el('p', 'credits-note', dialog, '再来一锅：从头开始，永久产量 +25%，图鉴和成就保留，并解锁一口新的锅。');
    const actions = el('div', 'dialog-actions', dialog);
    this.button(actions, 'btn', '再来一锅', () => onRestart()).dataset.action = 'restart';
    this.button(actions, 'btn is-glass', '再看一会儿', () => this.closeDialog());
  }

  showNotice(title: string, body: string): void {
    const dialog = this.openDialog(true);
    el('h2', '', dialog, title);
    el('p', '', dialog, body);
    const actions = el('div', 'dialog-actions', dialog);
    this.button(actions, 'btn', '知道了', () => this.closeDialog());
  }

  showAchievements(): void {
    const dialog = this.openDialog(false);
    const earned = new Set(this.sim.state.legacy.achievements);
    const head = el('div', 'dialog-head', dialog);
    el('h2', '', head, '成就');
    el('span', 'count-chip num', head, `${earned.size} / ${ACHIEVEMENTS.length}`);
    el('i', '', el('div', 'meter', dialog)).style.width = `${(earned.size / ACHIEVEMENTS.length) * 100}%`;
    const grid = el('div', 'achievement-grid', dialog);
    for (const def of ACHIEVEMENTS) {
      const got = earned.has(def.id);
      const card = el('div', `achievement${got ? '' : ' is-locked'}`, grid);
      el('span', 'achievement-icon', card).innerHTML = got ? ICONS.trophy : ICONS.lock;
      const text = el('div', '', card);
      el('b', '', text, got ? def.name : '？？？');
      el('small', '', text, got ? def.blurb : '还没发生。');
    }
    // The album of hidden things: what was found, and for the rest only where to look.
    const found = new Set(this.sim.state.legacy.found);
    const albumHead = el('div', 'dialog-head album-head', dialog);
    el('h2', '', albumHead, '彩蛋图鉴');
    el('span', 'count-chip num', albumHead, `${found.size} / ${EGGS.length}`);
    const album = el('div', 'achievement-grid', dialog);
    for (const egg of EGGS) {
      const got = found.has(egg.id);
      const card = el('div', `achievement${got ? '' : ' is-locked'}`, album);
      el('span', 'achievement-icon', card).innerHTML = got ? ICONS.find : ICONS.lock;
      const text = el('div', '', card);
      el('b', '', text, got ? egg.name : '？？？');
      el('small', '', text, got ? egg.blurb : `藏在${STAGES[egg.stage]!.name}，点点看。`);
    }
    const actions = el('div', 'dialog-actions', dialog);
    this.button(actions, 'btn is-quiet', '关闭', () => this.closeDialog());
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
    if (frenzy > 0) this.frenzyText.set(`狂热 ×${sim.derived.frenzyMultiplier} · ${Math.ceil(frenzy)} 秒`);
    setClass(this.hopperCall, 'is-on', sim.hopperActive);
    if (sim.hopperActive) {
      const more = sim.state.hopperSwarm;
      this.hopperCallText.set(sim.state.hopperSwarmSize > 1 ? (more > 0 ? `跳跳粒群！后面还有 ${more} 粒` : '最后一粒，抓住它！') : '跳跳粒出现了，快点它！');
    }
    // The first hint names what is there to click in each scene, and goes away once the player
    // has clicked, bought something, or simply been playing for a couple of minutes.
    this.playTime += deltaSeconds;
    const { clicks, purchases } = sim.state.stats;
    const learned = clicks > 0 || purchases > 0 || this.playTime > HINT_SECONDS;
    if (!learned) this.hintText.set(`点一下${HINT_VESSELS[Math.min(sim.state.stage, HINT_VESSELS.length - 1)]}里的玉米，也可以按住不放`);
    setClass(this.hint, 'is-gone', learned);

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
