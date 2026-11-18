export type CannonResult = 'normal' | 'perfect' | 'overpressure';

/** Everything the presentation layer may react to. */
export interface GameEvents {
  kernel_popped: { count: number; gained: number };
  producer_purchased: { producer: number; owned: number; quantity: number; spent: number; milestone: boolean };
  flavor_unlocked: { flavor: number; spent: number };
  upgrade_purchased: { upgrade: string; spent: number };
  cannon_fired: { result: CannonResult; gained: number };
  stage_broken: { stage: number };
  hopper_spawned: { id: number };
  hopper_caught: { id: number };
  hopper_escaped: { id: number };
  frenzy_ended: Record<string, never>;
  achievement_unlocked: { id: string };
  offline_collected: { seconds: number; gained: number };
  ending_reached: Record<string, never>;
  run_restarted: { runs: number };
}
