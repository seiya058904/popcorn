import { FLAVORS } from '../content/flavors.ts';
import { formatAmount } from '../content/format.ts';
import { PRODUCERS } from '../content/producers.ts';
import { STAGES } from '../content/stages.ts';
import { UPGRADES, type UpgradeDef, type UpgradeGroup } from '../content/upgrades.ts';
import type { Simulation } from '../sim/simulation.ts';
import { deny, el, pressBounce, setClass, Text } from './dom.ts';
import { ICONS, UNIT_ICONS } from './icons.ts';

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
  };
}

function setProgress(parts: TicketParts, value: number): void {
  const rounded = Math.round(value * 50) / 50;
  if (rounded === parts.lastProgress) return;
  parts.lastProgress = rounded;
  parts.progress.style.transform = `scaleX(${rounded})`;
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
  private readonly bulkButtons: HTMLButtonElement[] = [];

  constructor(parent: HTMLElement, sim: Simulation) {
    this.sim = sim;
    this.root = el('div', 'shop', parent);
    const tabs = el('div', 'shop-tabs', this.root);
    const body = el('div', 'shop-body', this.root);
    for (const label of ['设备', '口味', '升级']) {
      const button = el('button', 'shop-tab', tabs, label);
      const badge = el('span', 'badge num', button);
      const section = el('section', '', body);
      const index = this.tabs.length;
      button.addEventListener('pointerdown', () => this.selectTab(index));
      this.tabs.push({ button, section, badge: new Text(badge) });
    }
    this.selectTab(0);

    const unitSection = this.tabs[0]!.section;
    const bulkRow = el('div', 'bulk', unitSection);
    el('span', '', bulkRow, '一次买');
    for (const [value, label] of BULK_OPTIONS) {
      const button = el('button', 'num', bulkRow, label);
      button.addEventListener('pointerdown', () => {
        this.bulk = value;
        pressBounce(button);
        this.syncBulk();
      });
      this.bulkButtons.push(button);
    }
    this.syncBulk();

    for (const producer of PRODUCERS) {
      const parts = ticket(unitSection, UNIT_ICONS[producer.id]!);
      parts.root.dataset.unit = String(producer.id);
      parts.root.addEventListener('pointerdown', () => this.buyUnit(producer.id, parts.root));
      this.units.push(parts);
    }

    const flavorSection = this.tabs[1]!.section;
    this.flavor = ticket(flavorSection, ICONS.flavor);
    this.flavor.root.dataset.flavor = 'next';
    this.flavor.root.addEventListener('pointerdown', () => {
      if (this.sim.buyFlavor()) pressBounce(this.flavor.root);
      else deny(this.flavor.root);
    });
    const album = el('div', 'album', flavorSection);
    for (const flavor of FLAVORS) this.albumCells.push(el('span', '', album, flavor.name));

    const upgradeSection = this.tabs[2]!.section;
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
    parts.root.addEventListener('pointerdown', () => {
      if (this.sim.buyUpgrade(upgrade.id)) pressBounce(parts.root);
      else deny(parts.root);
    });
    this.upgrades.set(upgrade.id, parts);
  }

  private selectTab(index: number): void {
    this.tabs.forEach((tab, i) => {
      setClass(tab.button, 'is-active', i === index);
      setClass(tab.section, 'is-active', i === index);
    });
  }

  private syncBulk(): void {
    this.bulkButtons.forEach((button, i) => setClass(button, 'is-active', BULK_OPTIONS[i]![0] === this.bulk));
  }

  private quantityFor(producer: number): number {
    if (this.bulk === 'max') return Math.max(1, this.sim.maxAffordable(producer));
    return this.bulk;
  }

  private buyUnit(producer: number, node: HTMLElement): void {
    if (!this.sim.producerUnlocked(producer)) return;
    if (this.sim.buyProducer(producer, this.quantityFor(producer))) pressBounce(node);
    else deny(node);
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
      parts.blurb.set(producer.blurb);
      parts.owned.set(String(owned[id]));
      parts.price.set(formatAmount(price));
      setClass(parts.root, 'is-ready', ready);
      setClass(parts.root, 'is-dim', !ready);
      setClass(parts.root, 'is-next', id === 0 && ready && stats.purchases === 0);
      setProgress(parts, ready ? 0 : Math.min(1, popcorn / price));
    });
    this.tabs[0]!.badge.set(readyUnits > 0 ? String(readyUnits) : '');

    const next = sim.nextFlavorPrice;
    const flavors = sim.state.flavors;
    if (next === null) {
      this.flavor.name.set('十二味已集齐');
      this.flavor.blurb.set('再往下，就只剩月亮的味道了。');
      this.flavor.owned.set('12');
      this.flavor.price.set('');
      setClass(this.flavor.root, 'is-ready', false);
      setProgress(this.flavor, 0);
    } else {
      const def = FLAVORS[flavors]!;
      const ready = popcorn >= next;
      this.flavor.name.set(`${def.name}味`);
      this.flavor.blurb.set(`全部产量 ×1.4。${def.blurb}`);
      this.flavor.owned.set(`${flavors}/12`);
      this.flavor.price.set(formatAmount(next));
      setClass(this.flavor.root, 'is-ready', ready);
      setClass(this.flavor.root, 'is-dim', !ready);
      setProgress(this.flavor, ready ? 0 : Math.min(1, popcorn / next));
      this.tabs[1]!.badge.set(ready ? '1' : '');
    }
    if (next === null) this.tabs[1]!.badge.set('');
    this.albumCells.forEach((cell, index) => {
      const seen = index < Math.max(flavors, sim.state.legacy.flavorAlbum);
      if (seen && !cell.classList.contains('is-owned')) {
        cell.classList.add('is-owned');
        cell.style.background = FLAVORS[index]!.bottle;
        cell.style.color = index === 5 || index === 9 || index === 11 ? '#fff6e3' : '';
      }
    });

    let visibleUpgrades = 0;
    let readyUpgrades = 0;
    for (const upgrade of UPGRADES) {
      const parts = this.upgrades.get(upgrade.id)!;
      const available = sim.upgradeAvailable(upgrade);
      parts.root.style.display = available ? '' : 'none';
      if (!available) continue;
      visibleUpgrades += 1;
      const ready = popcorn >= upgrade.cost;
      if (ready) readyUpgrades += 1;
      setClass(parts.root, 'is-ready', ready);
      setClass(parts.root, 'is-dim', !ready);
      setProgress(parts, ready ? 0 : Math.min(1, popcorn / upgrade.cost));
    }
    this.noUpgrades.style.display = visibleUpgrades === 0 ? '' : 'none';
    this.tabs[2]!.badge.set(readyUpgrades > 0 ? String(readyUpgrades) : '');
  }
}
