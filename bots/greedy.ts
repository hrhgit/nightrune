// A simple deterministic bot: during placement, keep placing the first legal card, preferring
// empty slots, until nothing more can be placed; then run the round. Uses only engine functions
// for legality, so it never computes rules itself.
import { legalPlacements, step, type Action, type BattleState, type GameEvent } from '../engine/index.ts';

export function greedyPlacement(state: BattleState): Action {
  const options = legalPlacements(state);
  const empty = options.find((o) => (state.player.line[o.slot - 1] ?? null) === null);
  const choice = empty ?? options[0];
  return choice === undefined ? { type: 'run' } : { type: 'place', uid: choice.uid, slot: choice.slot };
}

/** Plays a battle to the end with the greedy bot. Returns every action taken and every event. */
export function playGreedy(initial: BattleState): { state: BattleState; actions: Action[]; events: GameEvent[] } {
  let state = initial;
  const actions: Action[] = [];
  const events: GameEvent[] = [];
  while (state.outcome === 'ongoing') {
    const action = greedyPlacement(state);
    const result = step(state, action);
    actions.push(action);
    events.push(...result.events);
    state = result.state;
  }
  return { state, actions, events };
}
