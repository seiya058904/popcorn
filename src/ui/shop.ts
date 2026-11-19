import { FLAVOR_MULTIPLIER, FLAVORS } from '../content/flavors.ts';
import { formatAmount } from '../content/format.ts';
import { PRODUCERS } from '../content/producers.ts';
import { STAGES } from '../content/stages.ts';
import { UPGRADES, type UpgradeDef, type UpgradeGroup } from '../content/upgrades.ts';
import type { Simulation } from '../sim/simulation.ts';
import { el, setClass, Text } from './dom.ts';
import { ICONS, UNIT_ICONS } from './icons.ts';
import { flip, MOTION, motionPrefs, play } from './motion.ts';
import { pressable } from './press.ts';
import { Segmented } from './segmented.ts';

type Bulk = 1 | 10 | 100 | 'max';
const BULK_OPTIONS: ReadonlyArray<readonly [Bulk, string]> = [
  [1, '×1'],
  [10, '×10'],
  [100, '×100'],
  ['max', '最大'],
];

const GROUP_ICON: Record<UpgradeGroup, string> = {
  click: ICONS.click,
  unit: ICONS.unit,
  synergy: ICONS.synergy,
  cannon: ICONS.cannon,
  hopper: ICONS.hopper,
  offline: ICONS.offline,
};

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

function ticket(parent: HTMLElement, icon: string, small = false): TicketParts {
  const root = el('button', `ticket${small ? ' is-small' : ''}`, parent);
  el('span', 'ticket-paper', root);
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
  private readonly units: TicketParts[] = [];
  private readonly flavor: TicketParts;
  private readonly albumCells: HTMLElement[] = [];
  private readonly upgrades = new Map<string, TicketParts>();
  private readonly noUpgrades: HTMLElement;
  private readonly tabControl: Segmented;
  private readonly bulkControl: Segmented;
  private readonly shownUpgrades = new Set<string>();

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

    for (const producer of PRODUCERS) {
      const parts = ticket(unitSection, UNIT_ICONS[producer.id]!);
      parts.root.dataset.unit = String(producer.id);
      parts.root.classList.add('is-unit');
      // Holding a machine's ticket keeps buying it, faster and faster.
      pressable(parts.root, { scale: 0.98, repeat: true, silentRelease: true, action: () => this.buyUnit(producer.id) });
      this.units.push(parts);
    }

    const flavorSection = sections[1]!;
    this.flavor = ticket(flavorSection, ICONS.flavor);
    this.flavor.root.dataset.flavor = 'next';
    pressable(this.flavor.root, { scale: 0.98, silentRelease: true, action: () => this.sim.buyFlavor() });
    const album = el('div', 'album', flavorSection);
    for (const flavor of FLAVORS) this.albumCells.push(el('span', '', album, flavor.name));

    const upgradeSection = sections[2]!;
    this.noUpgrades = el('div', 'empty-note', upgradeSection, '继续爆，新的升级很快就来。');
    for (const upgrade of UPGRADES) this.addUpgrade(upgradeSection, upgrade);
  }

  private addUpgrade(parent: HTMLElement, upgrade: UpgradeDef): void {
    const parts = ticket(parent, GROUP_ICON[upgrade.group], true);
    parts.root.style.display = 'none';
    parts.root.dataset.upgrade = upgrade.id;
    parts.name.set(upgrade.name);
    parts.blurb.set(upgrade.blurb);
    parts.price.set(formatAmount(upgrade.cost));
    pressable(parts.root, { scale: 0.98, silentRelease: true, action: () => this.sim.buyUpgrade(upgrade.id) });
    this.upgrades.set(upgrade.id, parts);
  }

  /**
   * The new page slides in from the side of the tab that was chosen, and the card, which is only
   * as tall as its contents, eases to its new height instead of jumping.
   */
  private showSection(index: number, previous: number): void {
    const before = this.root.getBoundingClientRect().height;
    this.tabs.forEach((tab, i) => setClass(tab.section, 'is-active', i === index));
    const after = this.root.getBoundingClientRect().height;
    if (!motionPrefs.reduced && Math.abs(after - before) > 1) {
      this.root.animate([{ height: `${before}px` }, { height: `${after}px` }], { duration: MOTION.slide.duration, easing: MOTION.slide.easing });
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
    const sim = this.sim;
    const { popcorn, owned, stats } = sim.state;
    let readyUnits = 0;
    let lockedShown = false;

    PRODUCERS.forEach((producer, id) => {
      const parts = this.units[id]!;
      const unlocked = sim.producerUnlocked(id);
      const visible = unlocked || !lockedShown;
      parts.root.style.display = visible ? '' : 'none';
      if (!visible) return;
      setClass(parts.root, 'is-locked', !unlocked);
      if (!unlocked) {
        lockedShown = true;
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
      const quantity = this.quantityFor(id);
      const price = sim.price(id, quantity);
      const ready = popcorn >= price;
      if (ready) readyUnits += 1;
      parts.name.set(quantity > 1 ? `${producer.name} ×${quantity}` : producer.name);
      const each = formatAmount(sim.derived.unitEach[id]!);
      const share = sim.derived.baseRate > 0 ? Math.round((sim.derived.unitRates[id]! / sim.derived.baseRate) * 100) : 0;
      // The joke greets a new machine; once it is working, the numbers matter more.
      parts.blurb.set(owned[id]! > 0 ? `每台 ${each}/秒 · 占产量 ${share}%` : `每台 ${each}/秒 · ${producer.blurb}`);
      if (parts.owned.set(String(owned[id])) && owned[id]! > 0) hop(parts.owned.element);
      parts.price.set(formatAmount(price));
      setReady(parts, ready);
      setClass(parts.root, 'is-next', id === 0 && ready && stats.purchases === 0);
      setProgress(parts, ready ? 0 : Math.min(1, popcorn / price));
    });
    this.setBadge(0, readyUnits);

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

    // Upgrades come and go as they unlock and sell; the list glides into its new shape.
    const available = UPGRADES.filter((upgrade) => sim.upgradeAvailable(upgrade));
    const changed = available.length !== this.shownUpgrades.size || available.some((upgrade) => !this.shownUpgrades.has(upgrade.id));
    if (changed) {
      const arriving = available.filter((upgrade) => !this.shownUpgrades.has(upgrade.id));
      const visibleBefore = [...this.shownUpgrades].map((id) => this.upgrades.get(id)!.root);
      flip(visibleBefore, () => {
        for (const upgrade of UPGRADES) this.upgrades.get(upgrade.id)!.root.style.display = 'none';
        for (const upgrade of available) this.upgrades.get(upgrade.id)!.root.style.display = '';
      });
      this.shownUpgrades.clear();
      for (const upgrade of available) this.shownUpgrades.add(upgrade.id);
      // Only animate arrivals after the first refresh, not the whole list on load.
      if (visibleBefore.length > 0 || arriving.length < available.length) {
        for (const upgrade of arriving) {
          play(this.upgrades.get(upgrade.id)!.root, [{ opacity: 0, transform: 'translateY(0.8rem) scale(0.98)' }, { opacity: 1, transform: 'none' }], MOTION.appear);
        }
      }
    }
    let readyUpgrades = 0;
    for (const upgrade of available) {
      const parts = this.upgrades.get(upgrade.id)!;
      const ready = popcorn >= upgrade.cost;
      if (ready) readyUpgrades += 1;
      setReady(parts, ready);
      setProgress(parts, ready ? 0 : Math.min(1, popcorn / upgrade.cost));
    }
    this.noUpgrades.style.display = available.length === 0 ? '' : 'none';
    this.setBadge(2, readyUpgrades);
  }
}
