import { FLAVOR_MULTIPLIER, FLAVORS } from '../content/flavors.ts';
import { formatAmount } from '../content/format.ts';
import { PRODUCERS_IN_ORDER, type ProducerDef } from '../content/producers.ts';
import { STAGES } from '../content/stages.ts';
import { TRACK_RUNGS, TRACKS, type TrackDef, type UpgradeDef, type UpgradeTrack } from '../content/upgrades.ts';
import { hasUpgrade, nextMilestone } from '../sim/economy.ts';
import type { Simulation } from '../sim/simulation.ts';
import { el, setClass, Text } from './dom.ts';
import { feedback } from './feedback.ts';
import { ICONS, UNIT_ICONS } from './icons.ts';
import { MOTION, motionPrefs, play } from './motion.ts';
import { pressable } from './press.ts';
import { Segmented } from './segmented.ts';

type Bulk = 1 | 10 | 100 | 'max';
const BULK_OPTIONS: ReadonlyArray<readonly [Bulk, string]> = [
  [1, '×1'],
  [10, '×10'],
  [100, '×100'],
  ['max', '最大'],
];

const TRACK_ICON: Record<UpgradeTrack, string> = {
  craft: ICONS.click,
  line: ICONS.synergy,
  play: ICONS.cannon,
  decor: ICONS.decor,
};

const CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9.5l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

interface TicketParts {
  root: HTMLButtonElement;
  name: Text;
  blurb: Text;
  owned: Text;
  price: Text;
  progress: HTMLElement;
  lastProgress: number;
  /** Whether it was affordable at the last refresh, to catch the moment it becomes so. */
  ready: boolean | null;
}

/**
 * One of the four fixed upgrade rows: a header with the row's progress, and a single ticket for
 * its next rung that turns into the one after it when bought, or a closing line once all are.
 */
interface RowParts {
  track: TrackDef;
  rungs: readonly UpgradeDef[];
  root: HTMLElement;
  pips: HTMLElement[];
  count: Text;
  ticket: TicketParts;
  icon: HTMLElement;
  /** Why the next rung cannot be bought yet, ahead of what it gives. */
  lock: Text;
  done: HTMLElement;
  /** The rung on the ticket at the last refresh: undefined before the first, null once complete. */
  shown: string | null | undefined;
}

/** The machines of one scene, under a header that folds them away. */
interface UnitGroup {
  stage: number;
  root: HTMLElement;
  head: HTMLButtonElement;
  meta: Text;
  badge: Text;
  body: HTMLElement;
  units: readonly ProducerDef[];
  collapsed: boolean;
}

function ticket(parent: HTMLElement, icon: string, small = false): TicketParts {
  const root = el('button', `ticket${small ? ' is-small' : ''}`, parent);
  el('span', 'ticket-paper', root);
  el('span', 'ticket-gleam', root);
  const bar = el('span', 'ticket-progress', root);
  const progress = el('i', '', bar);
  el('span', 'ticket-icon', root).innerHTML = icon;
  const main = el('span', 'ticket-main', root);
  const name = el('span', 'ticket-name', main);
  const blurb = el('span', 'ticket-blurb', main);
  const stub = el('span', 'ticket-stub', root);
  const owned = el('span', 'ticket-owned num', stub);
  const price = el('span', 'ticket-price num', stub);
  return {
    root,
    name: new Text(name),
    blurb: new Text(blurb),
    owned: new Text(owned),
    price: new Text(price),
    progress,
    lastProgress: -1,
    ready: null,
  };
}

function setProgress(parts: TicketParts, value: number): void {
  const rounded = Math.round(value * 50) / 50;
  if (rounded === parts.lastProgress) return;
  parts.lastProgress = rounded;
  parts.progress.style.transform = `scaleX(${rounded})`;
}

/** Ready or not; the moment a ticket becomes affordable, a gleam crosses it once. */
function setReady(parts: TicketParts, ready: boolean): void {
  if (parts.ready === false && ready) {
    parts.root.classList.remove('is-shine');
    void parts.root.offsetWidth;
    parts.root.classList.add('is-shine');
  }
  parts.ready = ready;
  setClass(parts.root, 'is-ready', ready);
  setClass(parts.root, 'is-dim', !ready);
}

/** A number that changed gives a little hop, so the eye catches it. */
function hop(node: HTMLElement, from = 1.28): void {
  play(node, [{ transform: `scale(${from})` }, { transform: 'scale(1)' }], MOTION.release);
}

export class Shop {
  readonly root: HTMLElement;
  private readonly sim: Simulation;
  private bulk: Bulk = 1;
  private readonly tabs: Array<{ button: HTMLButtonElement; section: HTMLElement; badge: Text }> = [];
  /** Indexed by machine id. */
  private readonly units: TicketParts[] = [];
  private readonly groups: UnitGroup[] = [];
  private readonly flavor: TicketParts;
  private readonly albumCells: HTMLElement[] = [];
  private readonly rows: RowParts[] = [];
  private readonly tabControl: Segmented;
  private readonly bulkControl: Segmented;
  /** The scene for which old groups were last folded away; -1 before the first refresh. */
  private foldedAt = -1;
  private heightAnimation: Animation | null = null;

  constructor(parent: HTMLElement, sim: Simulation) {
    this.sim = sim;
    this.root = el('div', 'shop', parent);
    const head = el('div', 'shop-head', this.root);
    const body = el('div', 'shop-body', this.root);
    const labels = ['设备', '口味', '升级'];
    const sections = labels.map(() => el('section', '', body));
    this.tabControl = new Segmented(
      head,
      'shop-tabs',
      labels,
      (index, previous) => this.showSection(index, previous),
      (button, label) => {
        button.classList.add('shop-tab');
        el('span', '', button, label);
      },
    );
    this.tabControl.items.forEach((button, index) => {
      const badge = el('span', 'badge num', button);
      this.tabs.push({ button, section: sections[index]!, badge: new Text(badge) });
    });
    setClass(sections[0]!, 'is-active', true);

    const unitSection = sections[0]!;
    const bulkRow = el('div', 'bulk', unitSection);
    el('span', 'bulk-label', bulkRow, '一次买');
    this.bulkControl = new Segmented(bulkRow, 'is-small', BULK_OPTIONS.map(([, label]) => label), (index) => {
      this.bulk = BULK_OPTIONS[index]![0];
      this.update();
    });
    for (const item of this.bulkControl.items) item.classList.add('num');
    for (const stage of STAGES) this.addGroup(unitSection, stage.id);

    const flavorSection = sections[1]!;
    this.flavor = ticket(flavorSection, ICONS.flavor);
    this.flavor.root.dataset.flavor = 'next';
    pressable(this.flavor.root, { scale: 0.98, silentRelease: true, action: () => this.sim.buyFlavor() });
    const album = el('div', 'album', flavorSection);
    for (const flavor of FLAVORS) this.albumCells.push(el('span', '', album, flavor.name));

    const upgradeSection = sections[2]!;
    for (const track of TRACKS) this.addRow(upgradeSection, track);
  }

  private addRow(parent: HTMLElement, track: TrackDef): void {
    const root = el('div', 'row', parent);
    root.dataset.track = track.id;
    const head = el('div', 'row-head', root);
    el('span', 'row-name', head, track.name);
    const pipRow = el('span', 'row-pips', head);
    const rungs = TRACK_RUNGS.get(track.id)!;
    const pips = rungs.map(() => el('i', '', pipRow));
    const count = new Text(el('span', 'row-count num', head));
    const parts = ticket(root, TRACK_ICON[track.id], true);
    // The reason it is locked goes first, in color; what it gives follows.
    const blurb = parts.blurb.element;
    blurb.textContent = '';
    const lock = new Text(el('span', 'ticket-lock', blurb));
    parts.blurb = new Text(el('span', '', blurb));
    const done = el('div', 'row-done', root);
    el('span', 'row-done-icon', done).innerHTML = ICONS.allIn;
    el('span', '', done, track.done);
    const row: RowParts = { track, rungs, root, pips, count, ticket: parts, icon: parts.root.querySelector('.ticket-icon')!, lock, done, shown: undefined };
    pressable(parts.root, { scale: 0.98, silentRelease: true, action: () => this.buyRow(row) });
    this.rows.push(row);
  }

  /** Buys the row's next rung; a refusal shakes the ticket. */
  private buyRow(row: RowParts): boolean {
    const head = this.sim.trackHead(row.track.id);
    if (!head || !this.sim.buyUpgrade(head.id)) return false;
    // At once, rather than at the next refresh, so the new rung is there as the press lets go.
    this.updateRows();
    return true;
  }

  private addGroup(parent: HTMLElement, stage: number): void {
    const units = PRODUCERS_IN_ORDER.filter((producer) => producer.unlockStage === stage);
    const root = el('div', 'shop-group', parent);
    root.dataset.group = String(stage);
    const head = el('button', 'shop-group-head', root);
    head.setAttribute('aria-expanded', 'true');
    el('span', 'shop-group-name', head, STAGES[stage]!.name);
    const badge = el('span', 'badge num', head);
    const meta = el('span', 'shop-group-meta num', head);
    el('span', 'shop-group-chevron', head).innerHTML = CHEVRON;
    const body = el('div', 'shop-group-body', root);
    const group: UnitGroup = { stage, root, head, meta: new Text(meta), badge: new Text(badge), body, units, collapsed: false };
    for (const producer of units) {
      const parts = ticket(body, UNIT_ICONS[producer.id]!);
      parts.root.dataset.unit = String(producer.id);
      parts.root.classList.add('is-unit');
      // Holding a machine's ticket keeps buying it, faster and faster.
      pressable(parts.root, { scale: 0.98, repeat: true, silentRelease: true, action: () => this.buyUnit(producer.id) });
      this.units[producer.id] = parts;
    }
    pressable(head, { quiet: true, scale: 0.98, action: () => this.toggleGroup(group) });
    this.groups.push(group);
  }

  private toggleGroup(group: UnitGroup): boolean {
    if (this.sim.state.stage < group.stage) return false;
    feedback.toggle(group.collapsed);
    this.setCollapsed(group, !group.collapsed, true);
    return true;
  }

  /**
   * Folds a scene's machines away or brings them back. The list closes a little faster than it
   * opens, and either can be reversed halfway.
   */
  private setCollapsed(group: UnitGroup, collapsed: boolean, animate: boolean): void {
    group.collapsed = collapsed;
    group.head.setAttribute('aria-expanded', String(!collapsed));
    setClass(group.root, 'is-collapsed', collapsed);
    const body = group.body;
    const from = body.getBoundingClientRect().height;
    for (const animation of body.getAnimations()) animation.cancel();
    body.style.display = '';
    const to = collapsed ? 0 : body.scrollHeight;
    if (!animate || motionPrefs.reduced || Math.abs(to - from) < 0.5) {
      body.style.overflow = '';
      body.style.display = collapsed ? 'none' : '';
      if (animate && !collapsed && motionPrefs.reduced) play(body, [{ opacity: 0 }, { opacity: 1 }], MOTION.fade);
      return;
    }
    const curve = collapsed ? MOTION.exit : MOTION.slide;
    body.style.overflow = 'hidden';
    const animation = body.animate(
      [
        { height: `${from}px`, opacity: collapsed ? 1 : 0.4 },
        { height: `${to}px`, opacity: collapsed ? 0 : 1 },
      ],
      { duration: curve.duration, easing: curve.easing },
    );
    animation.onfinish = () => {
      body.style.overflow = '';
      if (collapsed) body.style.display = 'none';
    };
  }

  /**
   * Machines two or more scenes back hardly matter any more, so on arrival in a new scene their
   * groups fold away (their headers still count what can be bought). The player can open them again.
   */
  private foldOldScenes(stage: number): void {
    if (stage === this.foldedAt) return;
    const animate = this.foldedAt >= 0;
    this.foldedAt = stage;
    for (const group of this.groups) if (group.stage < stage - 1 && !group.collapsed) this.setCollapsed(group, true, animate);
  }

  /**
   * The new page slides in from the side of the tab that was chosen, and the card, which is only
   * as tall as its contents, eases to its new height instead of jumping.
   */
  private showSection(index: number, previous: number): void {
    const before = this.root.getBoundingClientRect().height;
    this.heightAnimation?.cancel();
    this.heightAnimation = null;
    this.tabs.forEach((tab, i) => setClass(tab.section, 'is-active', i === index));
    const after = this.root.getBoundingClientRect().height;
    if (!motionPrefs.reduced && Math.abs(after - before) > 1) {
      const animation = this.root.animate([{ height: `${before}px` }, { height: `${after}px` }], { duration: MOTION.slide.duration, easing: MOTION.slide.easing });
      this.heightAnimation = animation;
      const clear = (): void => {
        if (this.heightAnimation === animation) this.heightAnimation = null;
      };
      animation.onfinish = clear;
      animation.oncancel = clear;
    }
    const shift = index > previous ? 1.6 : -1.6;
    play(this.tabs[index]!.section, [{ opacity: 0, transform: `translateX(${shift}rem)` }, { opacity: 1, transform: 'none' }], MOTION.fade);
  }

  private quantityFor(producer: number): number {
    if (this.bulk === 'max') return Math.max(1, this.sim.maxAffordable(producer));
    return this.bulk;
  }

  private buyUnit(producer: number): boolean {
    if (!this.sim.producerUnlocked(producer)) return false;
    return this.sim.buyProducer(producer, this.quantityFor(producer));
  }

  private setBadge(index: number, count: number): void {
    const badge = this.tabs[index]!.badge;
    if (badge.set(count > 0 ? String(count) : '') && count > 0) hop(badge.element, 0.4);
  }

  update(): void {
    this.updateUnits();
    this.updateFlavor();
    this.updateRows();
  }

  private updateUnits(): void {
    const sim = this.sim;
    const { popcorn, owned, stats, stage } = sim.state;
    this.foldOldScenes(stage);
    let readyUnits = 0;
    for (const group of this.groups) {
      const unlocked = stage >= group.stage;
      // Only the next scene's first machine is teased; later scenes stay a surprise.
      const visible = unlocked || group.stage === stage + 1;
      group.root.style.display = visible ? '' : 'none';
      if (!visible) continue;
      setClass(group.root, 'is-locked', !unlocked);
      let groupReady = 0;
      let groupOwned = 0;
      let kinds = 0;
      group.units.forEach((producer, index) => {
        const parts = this.units[producer.id]!;
        const id = producer.id;
        if (!unlocked) {
          parts.root.style.display = index === 0 ? '' : 'none';
          setClass(parts.root, 'is-locked', true);
          parts.name.set('？？？');
          parts.blurb.set(`突破「${STAGES[producer.unlockStage - 1]!.name}」后解锁`);
          parts.owned.set('');
          parts.price.set('');
          parts.ready = null;
          setClass(parts.root, 'is-ready', false);
          setClass(parts.root, 'is-dim', true);
          setProgress(parts, 0);
          return;
        }
        parts.root.style.display = '';
        setClass(parts.root, 'is-locked', false);
        const quantity = this.quantityFor(id);
        const price = sim.price(id, quantity);
        const ready = popcorn >= price;
        if (ready) groupReady += 1;
        groupOwned += owned[id]!;
        if (owned[id]! > 0) kinds += 1;
        parts.name.set(quantity > 1 ? `${producer.name} ×${quantity}` : producer.name);
        const each = formatAmount(sim.derived.unitEach[id]!);
        const share = sim.derived.baseRate > 0 ? Math.round((sim.derived.unitRates[id]! / sim.derived.baseRate) * 100) : 0;
        const milestone = nextMilestone(owned[id]!);
        // The joke greets a new machine; once it is working, the numbers matter more, and the next
        // milestone says what more of them will bring.
        parts.blurb.set(owned[id]! > 0 ? `每台 ${each}/秒 · 占产量 ${share}% · ${milestone.at} 台时 ×${milestone.mult}` : `每台 ${each}/秒 · ${producer.blurb}`);
        if (parts.owned.set(String(owned[id])) && owned[id]! > 0) hop(parts.owned.element);
        parts.price.set(formatAmount(price));
        setReady(parts, ready);
        setClass(parts.root, 'is-next', id === 0 && ready && stats.purchases === 0);
        setProgress(parts, ready ? 0 : Math.min(1, popcorn / price));
      });
      readyUnits += groupReady;
      group.meta.set(unlocked ? `${kinds}/${group.units.length} 种 · ${formatAmount(groupOwned)} 台` : '下一站');
      // A folded scene still says when something in it can be bought.
      const badge = group.collapsed && groupReady > 0 ? String(groupReady) : '';
      if (group.badge.set(badge) && badge) hop(group.badge.element, 0.4);
    }
    this.setBadge(0, readyUnits);
  }

  private updateFlavor(): void {
    const sim = this.sim;
    const popcorn = sim.state.popcorn;
    const next = sim.nextFlavorPrice;
    const flavors = sim.state.flavors;
    if (next === null) {
      this.flavor.name.set('十二味已集齐');
      this.flavor.blurb.set('再往下，就只剩月亮的味道了。');
      this.flavor.owned.set('12');
      this.flavor.price.set('');
      setClass(this.flavor.root, 'is-ready', false);
      setProgress(this.flavor, 0);
      this.setBadge(1, 0);
    } else {
      const def = FLAVORS[flavors]!;
      const ready = popcorn >= next;
      this.flavor.name.set(`${def.name}味`);
      this.flavor.blurb.set(`全部产量 ×${FLAVOR_MULTIPLIER}。${def.blurb}`);
      if (this.flavor.owned.set(`${flavors}/12`) && flavors > 0) hop(this.flavor.owned.element);
      this.flavor.price.set(formatAmount(next));
      setReady(this.flavor, ready);
      setProgress(this.flavor, ready ? 0 : Math.min(1, popcorn / next));
      this.setBadge(1, ready ? 1 : 0);
    }
    this.albumCells.forEach((cell, index) => {
      const seen = index < Math.max(flavors, sim.state.legacy.flavorAlbum);
      if (seen && !cell.classList.contains('is-owned')) {
        cell.classList.add('is-owned');
        cell.style.background = FLAVORS[index]!.bottle;
        cell.style.color = index === 5 || index === 9 || index === 11 ? '#fff6e3' : '';
        hop(cell, 0.6);
      }
    });
  }

  /**
   * Each row shows its next rung. When that rung changes (it was bought, or a new save was loaded),
   * the new one floats in where the old one was and the row's next pip lights; the page itself never
   * grows or shrinks.
   */
  private updateRows(): void {
    const sim = this.sim;
    const popcorn = sim.state.popcorn;
    let ready = 0;
    for (const row of this.rows) {
      const head = sim.trackHead(row.track.id);
      let owned = 0;
      row.rungs.forEach((rung, index) => {
        const has = hasUpgrade(sim.state, rung.id);
        if (has) owned += 1;
        const pip = row.pips[index]!;
        if (has && !pip.classList.contains('is-on')) {
          pip.classList.add('is-on');
          if (row.shown !== undefined) hop(pip, 0.3);
        }
      });
      if (row.count.set(`${owned}/${row.rungs.length}`) && row.shown !== undefined) hop(row.count.element, 1.2);
      const id = head?.id ?? null;
      const changed = id !== row.shown;
      const first = row.shown === undefined;
      row.shown = id;
      setClass(row.root, 'is-done', head === null);
      if (!head) {
        setClass(row.ticket.root, 'is-ready', false);
        if (changed && !first) play(row.done, [{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'none' }], MOTION.appear);
        continue;
      }
      const parts = row.ticket;
      if (changed) {
        parts.root.dataset.upgrade = head.id;
        parts.name.set(head.name);
        parts.price.set(formatAmount(head.cost));
        setClass(parts.root, 'is-gold', head.gold === true);
        row.icon.innerHTML = head.gold ? ICONS.gold : TRACK_ICON[row.track.id];
        // A fresh rung starts out as not affordable, so becoming affordable gleams once.
        parts.ready = null;
        parts.lastProgress = -1;
        if (!first) play(parts.root, [{ opacity: 0, transform: 'translateY(0.8rem) scale(0.98)' }, { opacity: 1, transform: 'none' }], MOTION.appear);
      }
      const lock = sim.upgradeLock(head);
      setClass(parts.root, 'is-locked', lock !== null);
      if (lock) {
        const needs = sim.needsProgress(head);
        row.lock.set(
          lock === 'stage'
            ? `突破「${STAGES[head.unlockStage - 1]!.name}」后解锁 · `
            : `${STAGES[head.needs!.stage]!.name}的三种设备各要 ${needs!.want} 台 · `,
        );
        // Behind the reason only what the rung gives fits in two lines; the joke comes once it can be bought.
        parts.blurb.set(head.blurb.slice(0, head.blurb.indexOf('。') + 1) || head.blurb);
        parts.owned.set(lock === 'needs' ? `${needs!.have}/${needs!.want}` : '');
        parts.ready = null;
        setClass(parts.root, 'is-ready', false);
        setClass(parts.root, 'is-dim', true);
        setProgress(parts, 0);
        continue;
      }
      row.lock.set('');
      parts.blurb.set(head.blurb);
      parts.owned.set('');
      const affordable = popcorn >= head.cost;
      if (affordable) ready += 1;
      setReady(parts, affordable);
      setProgress(parts, affordable ? 0 : Math.min(1, popcorn / head.cost));
    }
    this.setBadge(2, ready);
  }
}
