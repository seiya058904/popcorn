import { PRICE_GROWTH, PRODUCERS } from '../content/producers.ts';
import type { EventBus } from '../events/bus.ts';
import type { GameEvents } from '../events/game-events.ts';

export interface GameState {
  popcorn: number;
  totalEarned: number;
  owned: number[];
  clicks: number;
}

export function createState(): GameState {
  return { popcorn: 0, totalEarned: 0, owned: PRODUCERS.map(() => 0), clicks: 0 };
}

export function producerPrice(producer: number, owned: number): number {
  return Math.ceil(PRODUCERS[producer]!.baseCost * PRICE_GROWTH ** owned);
}

export class Simulation {
  state: GameState = createState();
  private readonly bus: EventBus<GameEvents>;

  constructor(bus: EventBus<GameEvents>) {
    this.bus = bus;
  }

  get perSecond(): number {
    return PRODUCERS.reduce((sum, producer) => sum + this.state.owned[producer.id]! * producer.baseRate, 0);
  }

  get clickValue(): number {
    return 1 + this.perSecond * 0.01;
  }

  private earn(amount: number): void {
    this.state.popcorn += amount;
    this.state.totalEarned += amount;
  }

  click(): { count: number; gainEach: number } {
    const count = 1;
    const gainEach = this.clickValue;
    this.earn(gainEach * count);
    this.state.clicks += 1;
    this.bus.emit('kernel_popped', { count, gained: gainEach * count });
    return { count, gainEach };
  }

  step(seconds: number): void {
    this.earn(this.perSecond * seconds);
  }

  price(producer: number): number {
    return producerPrice(producer, this.state.owned[producer]!);
  }

  buy(producer: number): boolean {
    const price = this.price(producer);
    if (this.state.popcorn < price) return false;
    this.state.popcorn -= price;
    this.state.owned[producer]! += 1;
    this.bus.emit('producer_purchased', { producer, owned: this.state.owned[producer]!, quantity: 1, spent: price });
    return true;
  }
}
