export type CannonResult = 'normal' | 'perfect' | 'overpressure';

/** Everything the presentation layer may react to. */
export interface GameEvents {
  /** `golden`: this click was a golden kernel and paid many times over. */
  kernel_popped: { count: number; gained: number; golden: boolean };
  auto_popped: { gained: number };
  producer_purchased: { producer: number; owned: number; quantity: number; spent: number; milestone: boolean };
  flavor_unlocked: { flavor: number; spent: number };
  upgrade_purchased: { upgrade: string; spent: number };
  /** `streak`: green shots in a row, this one included; 0 after any other result. */
  cannon_fired: { result: CannonResult; gained: number; streak: number };
  stage_broken: { stage: number };
  /** `swarm`: kernels of a swarm still to come after this one; 0 for a lone kernel. */
  hopper_spawned: { id: number; swarm: number };
  hopper_caught: { id: number; swarm: number };
  hopper_escaped: { id: number };
  frenzy_ended: Record<string, never>;
  achievement_unlocked: { id: string };
  offline_collected: { seconds: number; gained: number };
  ending_reached: Record<string, never>;
  run_restarted: { runs: number };
  machine_poked: { unit: number };
  /** `first`: never found before in any run, so it goes into the album now. */
  egg_found: { id: string; first: boolean };
}
