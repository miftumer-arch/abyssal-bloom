// Enemy kinds, their stats, and how waves are built. Pure data and spawn
// logic — the world owns the live list, this file only says what an enemy
// is and what a wave of them looks like.

import { ENEMY, FIELD, PALETTE, waveBeat } from './config.js';
import { createPop } from './feel.js';

export const KIND_MITE = 0;
export const KIND_GULPER = 1;
export const KIND_FANGTOOTH = 2;
export const KIND_SPORE = 3;
export const KIND_BOSS = 4;

/** Base stats per kind: radius, hp, speed, contact damage, xp, score, colour. */
export const TYPES = [
  { name: 'mite', radius: 10, hp: 12, speed: 105, damage: 6, xp: 1, score: 10, color: PALETTE.mite, glow: '#ff7a59' },
  { name: 'gulper', radius: 18, hp: 36, speed: 58, damage: 12, xp: 3, score: 25, color: PALETTE.gulper, glow: '#ff9f43' },
  { name: 'fangtooth', radius: 13, hp: 22, speed: 82, damage: 10, xp: 2, score: 20, color: PALETTE.fangtooth, glow: '#c77dff' },
  { name: 'spore', radius: 15, hp: 26, speed: 46, damage: 8, xp: 2, score: 20, color: PALETTE.spore, glow: '#7ee081' },
  { name: 'angler', radius: 46, hp: 700, speed: 48, damage: 20, xp: 40, score: 500, color: PALETTE.boss, glow: '#ff5da2' },
];

/** Which kinds a wave may contain: the abyss gets meaner as you descend. */
export function kindsForWave(wave) {
  const kinds = [KIND_MITE];
  if (wave >= 2) kinds.push(KIND_GULPER);
  if (wave >= 3) kinds.push(KIND_FANGTOOTH);
  if (wave >= 4) kinds.push(KIND_SPORE);
  return kinds;
}

/** How many enemies a wave holds (the boss wave adds the boss on top). */
export function waveCount(wave) {
  return waveBeat(wave).count;
}

export function isBossWave(wave) {
  return wave % ENEMY.bossEvery === 0;
}

/** hp and speed multipliers for a wave. */
export function waveScale(wave) {
  return {
    hp: 1 + ENEMY.hpPerWave * (wave - 1),
    speed: 1 + ENEMY.speedPerWave * (wave - 1),
  };
}

/** A spawn point just outside one edge, biased away from the player. */
export function edgePoint(random, px, py) {
  const margin = 40;
  const side = Math.floor(random() * 4);
  let x;
  let y;
  if (side === 0) { x = -margin; y = random() * FIELD.height; }
  else if (side === 1) { x = FIELD.width + margin; y = random() * FIELD.height; }
  else if (side === 2) { x = random() * FIELD.width; y = -margin; }
  else { x = random() * FIELD.width; y = FIELD.height + margin; }
  // If the point landed too close to the player, flip to the far side.
  if (Math.hypot(x - px, y - py) < 260) {
    x = FIELD.width - x;
    y = FIELD.height - y;
  }
  return { x, y };
}

// ------------------------------------------------------------ live enemy ---
// game-ai: each enemy is perceive -> decide -> steer. Mites, gulpers and
// spores just seek; fangtooth and the boss run a small FSM with hysteresis:
// separate enter/exit ranges and a minimum time in each state, so the agent
// never flickers at a boundary. The telegraph state is the fairness guard:
// a big hit is always announced ~0.5 s before it lands.

/** A live enemy instance (the world owns the list; this file owns the AI). */
export function createEnemy(kind, x, y, wave) {
  const t = TYPES[kind];
  const scale = waveScale(wave);
  const hp = Math.round(t.hp * scale.hp);
  return {
    kind, x, y, vx: 0, vy: 0,
    radius: t.radius, hp, maxHp: hp,
    speed: t.speed * scale.speed,
    damage: t.damage, xp: t.xp, score: t.score,
    color: t.color, glow: t.glow,
    flash: 0, pop: createPop(), dead: false,
    state: 'seek', stateT: 0, dirX: 0, dirY: 0,
    spawnT: 0, spawnRequest: 0,
  };
}

function seek(e, px, py, speed) {
  const dx = px - e.x;
  const dy = py - e.y;
  const d = Math.hypot(dx, dy) || 1;
  e.vx = (dx / d) * speed;
  e.vy = (dy / d) * speed;
}

/**
 * Advance one enemy's FSM one tick. Sets e.vx/e.vy (steering) and may set
 * e.spawnRequest (boss asking the world to spawn mites). Pure decision:
 * movement integration and separation live in the world.
 */
export function updateEnemyAI(e, px, py, dt) {
  e.stateT += dt;
  const dx = px - e.x;
  const dy = py - e.y;
  const dist = Math.hypot(dx, dy) || 1;

  if (e.kind === KIND_FANGTOOTH) {
    if (e.state === 'seek') {
      seek(e, px, py, e.speed);
      if (dist < 260 && e.stateT >= 0.5) { e.state = 'telegraph'; e.stateT = 0; }
    } else if (e.state === 'telegraph') {
      e.vx = 0; e.vy = 0; // the wind-up: the player sees the glow build
      if (e.stateT >= 0.5) {
        e.dirX = dx / dist; e.dirY = dy / dist;
        e.state = 'charge'; e.stateT = 0;
      }
    } else if (e.state === 'charge') {
      e.vx = e.dirX * e.speed * 3.2;
      e.vy = e.dirY * e.speed * 3.2;
      if (e.stateT >= 0.4) { e.state = 'recover'; e.stateT = 0; }
    } else { // recover
      e.vx *= 0.9; e.vy *= 0.9;
      if (e.stateT >= 0.6) { e.state = 'seek'; e.stateT = 0; }
    }
    return;
  }

  if (e.kind === KIND_BOSS) {
    if (e.state === 'drift') {
      seek(e, px, py, e.speed);
      e.spawnT += dt;
      if (e.spawnT >= 4) { e.spawnT = 0; e.spawnRequest += 1; }
      if (dist < 320 && e.stateT >= 1.0) { e.state = 'telegraph'; e.stateT = 0; }
    } else if (e.state === 'telegraph') {
      e.vx = 0; e.vy = 0;
      if (e.stateT >= 0.6) {
        e.dirX = dx / dist; e.dirY = dy / dist;
        e.state = 'charge'; e.stateT = 0;
      }
    } else if (e.state === 'charge') {
      e.vx = e.dirX * e.speed * 3;
      e.vy = e.dirY * e.speed * 3;
      if (e.stateT >= 0.5) {
        e.state = 'recover'; e.stateT = 0;
        e.spawnRequest += 3; // the charge ends in a burst of mites
      }
    } else { // recover
      e.vx *= 0.9; e.vy *= 0.9;
      if (e.stateT >= 0.8) { e.state = 'drift'; e.stateT = 0; }
    }
    return;
  }

  // Mite, gulper, spore: pure seek.
  seek(e, px, py, e.speed);
}
