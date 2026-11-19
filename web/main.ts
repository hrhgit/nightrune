// The web page. It shows engine state and sends actions to the engine; every rule decision
// (legality, costs, damage, HP) comes from the engine or from event payloads.
import '@fontsource/alegreya/600.css';
import '@fontsource/alegreya/700.css';
import '@fontsource/alegreya-sans/400.css';
import '@fontsource/alegreya-sans/500.css';
import '@fontsource/alegreya-sans/700.css';
import './style.css';
import {
  assertNever,
  cardDef,
  checkPlace,
  EngineError,
  enemyDef,
  legalPlacements,
  startBattle,
  step,
  type BattleState,
  type EnemyId,
  type GameEvent,
  type Owner,
} from '../engine/index.ts';
import { parseSeed, SEED_HELP } from '../present/seed.ts';
import { battleEndText, cardEffectText, cardName, eventText, rejectText } from '../present/text.ts';
import { BOARD, drawBoard, slotRect, type Impact } from './board.ts';
import { handCanvas, look, watchHand } from './look.ts';

const ENEMY_ID: EnemyId = 'training-dummy';
const BEAT_MS = { slot: 700, emptySlot: 220, pre: 260 } as const;
/** How long one block or damage event animates on the board. */
const IMPACT_MS = 1000;

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`Missing #${id}`);
  return el as T;
}

const canvas = byId<HTMLCanvasElement>('board');
const ctx = canvas.getContext('2d');
if (ctx === null) throw new Error('Canvas 2D is not available');
const slotsEl = byId<HTMLDivElement>('slots');
const handEl = byId<HTMLDivElement>('hand');
const hintEl = byId<HTMLParagraphElement>('hint');
const runBtn = byId<HTMLButtonElement>('run');
const energyEl = byId<HTMLSpanElement>('energy');
const roundEl = byId<HTMLSpanElement>('round');
const pilesEl = byId<HTMLSpanElement>('piles');
const logEl = byId<HTMLOListElement>('log');
const statusEl = byId<HTMLParagraphElement>('status');
const endEl = byId<HTMLDivElement>('end');
const endTitle = byId<HTMLHeadingElement>('end-title');
const endText = byId<HTMLParagraphElement>('end-text');
const replayBtn = byId<HTMLButtonElement>('replay');
const newSeedEndBtn = byId<HTMLButtonElement>('new-seed-end');
const seedForm = byId<HTMLFormElement>('seed-form');
const seedInput = byId<HTMLInputElement>('seed');
const seedError = byId<HTMLParagraphElement>('seed-error');
const newSeedBtn = byId<HTMLButtonElement>('new-seed');

const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

interface Beat {
  readonly slot: number | null;
  readonly events: readonly GameEvent[];
  readonly duration: number;
}

interface Animation {
  readonly beats: readonly Beat[];
  readonly after: BattleState;
  index: number;
  beatStart: number;
  timer: number | undefined;
}

interface App {
  state: BattleState;
  selected: string | null;
  hoverSlot: number | null;
  anim: Animation | null;
  /** HP shown while a round animates, taken from damage event payloads. */
  shownHp: Record<Owner, number>;
  cursor: number | null;
  firing: Map<string, number>;
  /** Block and damage events being animated, with the time each fired. */
  impacts: { event: Impact['event']; born: number }[];
  /** HP shown before the latest hit on each side, so the bar can show what was just lost. */
  hpBefore: Record<Owner, number | null>;
  maxHp: Record<Owner, number>;
  /** Card values shown while a round animates, taken from grow event payloads (by uid). */
  shownValue: Map<string, number>;
}

let app: App;

function randomSeed(): number {
  // Picking a fresh seed is the only use of randomness outside the engine; the seed is shown
  // and can be shared, so every game stays reproducible.
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

function startGame(seed: number): void {
  // A round may still be animating; stop its timer so it cannot drive the new battle.
  if (typeof app !== 'undefined' && app.anim !== null) window.clearTimeout(app.anim.timer);
  const opening = startBattle({ enemyId: ENEMY_ID, seed });
  app = {
    state: opening.state,
    selected: null,
    hoverSlot: null,
    anim: null,
    shownHp: { player: opening.state.player.hp, enemy: opening.state.enemy.hp },
    cursor: null,
    firing: new Map(),
    impacts: [],
    hpBefore: { player: null, enemy: null },
    maxHp: { player: opening.state.player.hp, enemy: opening.state.enemy.hp },
    shownValue: new Map(),
  };
  seedInput.value = String(seed);
  seedError.textContent = '';
  const url = new URL(window.location.href);
  url.searchParams.set('seed', String(seed));
  window.history.replaceState(null, '', url);
  logEl.replaceChildren();
  appendLog(opening.events);
  endEl.hidden = true;
  setHint('Choose a card from your hand, then a slot on your line.');
  renderControls();
}

// ---------------------------------------------------------------------------
// Log, hint, status
// ---------------------------------------------------------------------------

function appendLog(events: readonly GameEvent[]): void {
  for (const e of events) {
    if (e.type === 'draw') continue; // the hand shows what was drawn
    const li = document.createElement('li');
    li.textContent = eventText(e, ENEMY_ID);
    li.dataset['type'] = e.type;
    logEl.append(li);
  }
  // Scroll only the log list; never move the page under the player.
  logEl.scrollTop = logEl.scrollHeight;
}

function setHint(text: string): void {
  hintEl.textContent = text;
}

function announce(): void {
  const s = app.state;
  statusEl.textContent =
    `Round ${s.round}. Energy ${s.player.energy}. You ${app.shownHp.player} HP, ` +
    `${enemyDef(ENEMY_ID).name} ${app.shownHp.enemy} HP.`;
}

// ---------------------------------------------------------------------------
// Controls (HTML)
// ---------------------------------------------------------------------------

/** Slot label for assistive tech: the occupant and, with a card selected, whether it can go here (engine's answer). */
function slotLabel(slot: number): string {
  const card = app.state.player.line[slot - 1] ?? null;
  const base = card === null ? `Slot ${slot}, empty` : `Slot ${slot}, ${cardName(card.cardId)}`;
  const selected = app.state.player.hand.find((c) => c.uid === app.selected);
  if (selected === undefined || app.anim !== null || app.state.outcome !== 'ongoing') return base;
  const name = cardName(selected.cardId);
  const check = checkPlace(app.state, selected.uid, slot);
  if (check.ok) return `${base}. Place ${name} here${check.replaces === null ? '' : `, replacing ${cardName(check.replaces.cardId)}`}.`;
  return `${base}. ${name} cannot go here: ${rejectText(check.reason)}`;
}

function buildSlotButtons(): void {
  for (let slot = 1; slot <= app.state.player.line.length; slot++) {
    const r = slotRect('player', slot);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'slot';
    btn.dataset['slot'] = String(slot);
    btn.style.left = `${(r.x / BOARD.width) * 100}%`;
    btn.style.top = `${(r.y / BOARD.height) * 100}%`;
    btn.style.width = `${(r.w / BOARD.width) * 100}%`;
    btn.style.height = `${(r.h / BOARD.height) * 100}%`;
    btn.addEventListener('click', () => onSlot(slot));
    btn.addEventListener('pointerenter', () => (app.hoverSlot = slot));
    btn.addEventListener('pointerleave', () => (app.hoverSlot = null));
    btn.addEventListener('focus', () => (app.hoverSlot = slot));
    btn.addEventListener('blur', () => (app.hoverSlot = null));
    slotsEl.append(btn);
  }
}

function renderControls(): void {
  const s = app.state;
  const busy = app.anim !== null;
  const over = s.outcome !== 'ongoing';
  const legal = busy || over ? [] : legalPlacements(s);
  const playable = new Set(legal.map((p) => p.uid));

  // Energy as pips plus text.
  energyEl.replaceChildren();
  const max = Math.max(s.player.energy, 3);
  for (let i = 0; i < max; i++) {
    const pip = document.createElement('span');
    pip.className = i < s.player.energy ? 'pip on' : 'pip';
    pip.setAttribute('aria-hidden', 'true');
    energyEl.append(pip);
  }
  const energyText = document.createElement('span');
  energyText.className = 'energy-text';
  energyText.textContent = `${s.player.energy} energy`;
  energyEl.append(energyText);
  roundEl.textContent = `Round ${s.round}`;
  pilesEl.textContent = `Draw pile ${s.player.drawPile.length}, discard ${s.player.discard.length}`;

  // Hand. Rebuilding the buttons would drop keyboard focus, so remember which card had it.
  const focusedUid = document.activeElement instanceof HTMLElement && handEl.contains(document.activeElement)
    ? (document.activeElement.dataset['uid'] ?? null)
    : null;
  const handCards = busy ? [] : s.player.hand;
  handEl.replaceChildren();
  if (handCards.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'hand-empty';
    empty.textContent = busy ? 'The lines are striking.' : over ? 'The battle is over.' : 'Your hand is empty. Fight the round to draw again.';
    handEl.append(empty);
  }
  for (const card of handCards) {
    const def = cardDef(card.cardId);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'card';
    btn.dataset['uid'] = card.uid;
    btn.setAttribute('aria-pressed', String(app.selected === card.uid));
    btn.setAttribute('aria-label', `${def.name}, cost ${def.cost}. ${cardEffectText(card)}`);
    if (!playable.has(card.uid)) btn.classList.add('unplayable');
    btn.append(handCanvas(card, app.selected === card.uid));
    btn.addEventListener('click', () => onCard(card.uid));
    handEl.append(btn);
    if (card.uid === focusedUid) btn.focus();
  }

  // Slots.
  for (const btn of slotsEl.querySelectorAll<HTMLButtonElement>('button.slot')) {
    const slot = Number(btn.dataset['slot']);
    btn.setAttribute('aria-label', slotLabel(slot));
    btn.disabled = busy || over;
  }

  runBtn.disabled = over;
  runBtn.textContent = busy ? 'Skip to the end of the round' : over ? 'Battle over' : `Fight round ${s.round}`;
  announce();
}

function onCard(uid: string): void {
  if (app.anim !== null) return;
  app.selected = app.selected === uid ? null : uid;
  if (app.selected === null) {
    setHint('Choose a card from your hand, then a slot on your line.');
  } else {
    const card = app.state.player.hand.find((c) => c.uid === uid);
    const name = card === undefined ? 'Card' : cardName(card.cardId);
    const any = legalPlacements(app.state).some((p) => p.uid === uid);
    if (any) {
      setHint(`${name} selected. Choose a slot on your line.`);
    } else {
      const reason = [1, 2, 3, 4].map((slot) => checkPlace(app.state, uid, slot)).find((c) => !c.ok);
      setHint(reason !== undefined && !reason.ok ? rejectText(reason.reason) : `${name} cannot be placed now.`);
    }
  }
  renderControls();
}

function onSlot(slot: number): void {
  if (app.anim !== null || app.state.outcome !== 'ongoing') return;
  if (app.selected === null) {
    setHint('Choose a card from your hand first.');
    return;
  }
  const check = checkPlace(app.state, app.selected, slot);
  if (!check.ok) {
    setHint(rejectText(check.reason));
    return;
  }
  try {
    const result = step(app.state, { type: 'place', uid: app.selected, slot });
    app.state = result.state;
    app.selected = null;
    appendLog(result.events);
    setHint(app.state.player.energy > 0 ? 'Place another card, or fight the round.' : 'Out of energy. Fight the round.');
  } catch (e) {
    if (e instanceof EngineError) setHint(rejectText(e.reason));
    else throw e;
  }
  renderControls();
}

// ---------------------------------------------------------------------------
// Running a round: split the engine's events into beats, one per slot.
// ---------------------------------------------------------------------------

function buildBeats(events: readonly GameEvent[], motion: boolean): Beat[] {
  const beats: Beat[] = [];
  const pre: GameEvent[] = [];
  const post: GameEvent[] = [];
  let current: { slot: number; events: GameEvent[] } | null = null;
  let afterRun = false;
  const slotMs = motion ? BEAT_MS.slot : BEAT_MS.slot * 0.6;
  const flush = (): void => {
    if (current === null) return;
    const fired = current.events.some((e) => e.type === 'trigger');
    beats.push({ slot: current.slot, events: current.events, duration: fired ? slotMs : BEAT_MS.emptySlot });
    current = null;
  };
  for (const e of events) {
    if (afterRun) {
      post.push(e);
      continue;
    }
    // A switch with assertNever: a new event type must be placed in a beat explicitly.
    switch (e.type) {
      case 'discard':
      case 'round-start':
        // Before the cursor moves: R-06 hand discards and the round header. (A discard from the
        // line only happens during placement, so it never arrives mid-run.)
        pre.push(e);
        break;
      case 'trigger':
      case 'grow':
      case 'copy':
      case 'fizzle':
      case 'block':
      case 'damage': {
        const lastSlot: number = current?.slot ?? 0;
        if (current === null || current.slot !== e.slot) {
          flush();
          for (let s = lastSlot + 1; s < e.slot; s++) beats.push({ slot: s, events: [], duration: BEAT_MS.emptySlot });
          current = { slot: e.slot, events: [] };
        }
        current.events.push(e);
        break;
      }
      case 'battle-end': {
      // R-10 ends the run right after the current slot; the round limit ends it after the last slot.
      const lastSlot: number = current?.slot ?? beats.at(-1)?.slot ?? 0;
      const endSlot = e.reason === 'round-limit' ? app.state.player.line.length : Math.max(lastSlot, 1);
      if (current === null || current.slot !== endSlot) {
        flush();
        for (let s = lastSlot + 1; s < endSlot; s++) beats.push({ slot: s, events: [], duration: BEAT_MS.emptySlot });
        current = { slot: endSlot, events: [] };
      }
      current.events.push(e);
      afterRun = true;
      flush();
      break;
      }
      case 'placement-start':
      case 'shuffle':
      case 'draw':
      case 'place': {
        // The next round's placement has begun.
        const lastSlot: number = current?.slot ?? beats.at(-1)?.slot ?? 0;
        flush();
        for (let s = lastSlot + 1; s <= app.state.player.line.length; s++) beats.push({ slot: s, events: [], duration: BEAT_MS.emptySlot });
        afterRun = true;
        post.push(e);
        break;
      }
      default:
        assertNever(e);
    }
  }
  flush();
  return [{ slot: null, events: pre, duration: BEAT_MS.pre }, ...beats, { slot: null, events: post, duration: 0 }];
}

function onRun(): void {
  if (app.anim !== null) {
    finishAnimation();
    return;
  }
  if (app.state.outcome !== 'ongoing') return;
  const result = step(app.state, { type: 'run' });
  app.selected = null;
  app.anim = { beats: buildBeats(result.events, !motionQuery.matches), after: result.state, index: -1, beatStart: 0, timer: undefined };
  setHint('');
  renderControls();
  advanceBeat(app.anim);
}

/**
 * Beats advance on a timer, not on animation frames, so a throttled or hidden tab still finishes the round.
 * Each timer carries the animation that scheduled it and stops if that animation is no longer current.
 */
function advanceBeat(anim: Animation): void {
  if (app.anim !== anim) return;
  anim.index += 1;
  anim.beatStart = performance.now();
  const beat = anim.beats[anim.index];
  if (beat === undefined) {
    finishAnimation();
    return;
  }
  enterBeat(beat, anim.beatStart);
  anim.timer = window.setTimeout(() => advanceBeat(anim), beat.duration);
}

function enterBeat(beat: Beat, now: number): void {
  app.cursor = beat.slot;
  app.firing = new Map();
  for (const e of beat.events) {
    if (e.type === 'trigger') app.firing.set(e.uid, 1);
    // R-13: the copied card lights up too, so the player sees which card the Echo is copying
    // (in a chain of Echoes, the card at the end of the chain, R-13.5).
    if (e.type === 'copy') app.firing.set(e.asUid, 1);
    if (e.type === 'damage') {
      app.hpBefore[e.target] = app.shownHp[e.target];
      app.shownHp[e.target] = e.hpAfter;
    }
    // Shown with or without motion: reduced motion removes movement (see drawStrikes), not information.
    // R-14: the grown card shows its new value from the event, as HP does; the UI adds nothing.
    if (e.type === 'grow') app.shownValue.set(e.targetUid, e.valueAfter);
    if (e.type === 'damage' || e.type === 'block' || e.type === 'grow' || e.type === 'copy' || e.type === 'fizzle') app.impacts.push({ event: e, born: now });
  }
  appendLog(beat.events);
  announce();
}

function finishAnimation(): void {
  const anim = app.anim;
  if (anim === null) return;
  window.clearTimeout(anim.timer);
  for (let i = anim.index + 1; i < anim.beats.length; i++) {
    const beat = anim.beats[i];
    if (beat !== undefined) appendLog(beat.events);
  }
  app.anim = null;
  app.state = anim.after;
  app.shownValue = new Map();
  app.shownHp = { player: anim.after.player.hp, enemy: anim.after.enemy.hp };
  app.cursor = null;
  app.firing = new Map();
  // Impacts are left to finish on their own (tick drops them when they expire), so the last
  // hit of a round, including the one that ends the battle, gets its full time on screen.
  if (app.state.outcome === 'ongoing') {
    setHint('New hand drawn. Choose a card, then a slot.');
  } else {
    showEnd(anim.beats.flatMap((b) => b.events));
  }
  renderControls();
}

function showEnd(events: readonly GameEvent[]): void {
  const end = events.find((e) => e.type === 'battle-end');
  if (end === undefined || end.type !== 'battle-end') return;
  endTitle.textContent = end.outcome === 'won' ? 'Victory' : 'Defeat';
  endText.textContent = `${battleEndText(end.reason, end.round, enemyDef(ENEMY_ID).name)} Seed ${app.state.seed}.`;
  replayBtn.textContent = `Replay seed ${app.state.seed}`;
  endEl.hidden = false;
  replayBtn.focus();
}

function tick(now: number): void {
  const anim = app.anim;
  const current = anim?.beats[anim.index];
  if (anim !== null && current !== undefined && current.duration > 0) {
    const t = Math.min(1, (now - anim.beatStart) / current.duration);
    for (const uid of app.firing.keys()) app.firing.set(uid, 1 - 0.5 * t);
  }
  app.impacts = app.impacts.filter((f) => now - f.born < IMPACT_MS);
  draw(now);
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function resizeCanvas(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(BOARD.width * dpr);
  canvas.height = Math.round(BOARD.height * dpr);
}

function draw(now: number): void {
  if (ctx === null) return;
  const dpr = canvas.width / BOARD.width;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const selected = app.selected;
  const targets = new Set<number>(
    selected === null || app.anim !== null ? [] : legalPlacements(app.state).flatMap((p) => (p.uid === selected ? [p.slot] : [])),
  );
  const impacts: Impact[] = app.impacts.map((f) => ({ event: f.event, age: (now - f.born) / IMPACT_MS }));
  const hp = (side: Owner) => {
    const before = app.hpBefore[side];
    const base = { now: app.shownHp[side], max: app.maxHp[side] };
    return before === null ? base : { ...base, before };
  };
  drawBoard(ctx, {
    seed: app.state.seed,
    time: now,
    motion: !motionQuery.matches,
    enemyId: ENEMY_ID,
    enemyName: enemyDef(ENEMY_ID).name,
    hp: { player: hp('player'), enemy: hp('enemy') },
    lines: { player: app.state.player.line, enemy: app.state.enemy.line },
    look: (card) => {
      const shown = app.shownValue.get(card.uid);
      const base = look(card);
      return shown === undefined ? base : { ...base, value: shown };
    },
    cursor: app.cursor,
    firing: app.firing,
    targets,
    hoverSlot: app.hoverSlot,
    impacts,
    handTray,
  });
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

runBtn.addEventListener('click', onRun);
replayBtn.addEventListener('click', () => startGame(app.state.seed));
newSeedEndBtn.addEventListener('click', () => startGame(randomSeed()));
newSeedBtn.addEventListener('click', () => startGame(randomSeed()));
seedForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const seed = parseSeed(seedInput.value);
  if (seed === null) {
    seedError.textContent = SEED_HELP;
    seedInput.focus();
    return;
  }
  startGame(seed);
});
window.addEventListener('resize', resizeCanvas);

// The hand sits in the board's tray on wide screens and below the board on narrow ones.
const boardWrap = slotsEl.parentElement as HTMLElement;
let handTray = watchHand(handEl, boardWrap, { before: runBtn }, (inTray) => {
  handTray = inTray;
});

const urlSeed = parseSeed(new URL(window.location.href).searchParams.get('seed') ?? '');
resizeCanvas();
startGame(urlSeed ?? randomSeed());
buildSlotButtons();
renderControls();
void document.fonts.ready.then(() => renderControls());
requestAnimationFrame(tick);
