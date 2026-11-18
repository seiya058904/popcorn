/** Everything the presentation layer may react to. Payloads grow with the simulation. */
export interface GameEvents {
  kernel_popped: { count: number; gained: number };
  producer_purchased: { producer: number; owned: number; quantity: number; spent: number };
  flavor_unlocked: { flavor: number };
  cannon_fired: { result: 'normal' | 'perfect' | 'overpressure'; gained: number };
  stage_broken: { stage: number };
}
