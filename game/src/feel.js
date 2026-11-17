// feel.js — game juice: trauma screen shake, hit-stop, squash & stretch.
// From game-feel skill: shake is trauma^2 driven by summed sines (never per-frame
// random), decays in REAL time so it never freezes off-centre during hit-stop;
// hit-stop slows the sim but restores only by the newest call's id; squash pops
// overshoot and settle back to exactly 1. Visual only — never moves bodies.
import { CFG } from './config.js';

// ---------------------------------------------------------------- shake ---
export function createShake() {
  return { trauma: 0, t: 0, x: 0, y: 0 };
}

export function addTrauma(shake, amount) {
  shake.trauma = Math.min(1, shake.trauma + amount);
}

// Real dt (not scaled): shake keeps decaying during hit-stop.
export function updateShake(shake, realDt) {
  if (shake.trauma <= 0) { shake.x = 0; shake.y = 0; return; }
  shake.trauma = Math.max(0, shake.trauma - CFG.shakeDecay * realDt);
  const s = shake.trauma * shake.trauma; // trauma^2: light hits barely move
  shake.t += realDt * 30;
  shake.x = CFG.shakeMaxX * s * Math.sin(shake.t * 1.7);
  shake.y = CFG.shakeMaxY * s * Math.sin(shake.t * 2.3);
  if (shake.trauma === 0) { shake.x = 0; shake.y = 0; }
}

// -------------------------------------------------------------- hit-stop ---
// timeScale 1 normally; hitStop() drops it and restores after a REAL-time
// delay. Only the newest call restores (overlapping stops can't cut each other).
export function createTimeScale() {
  return { scale: 1, until: 0 };
}

export function hitStop(ts, duration, slow, nowReal) {
  ts.scale = slow;
  ts.until = nowReal + duration;
}

export function updateTimeScale(ts, nowReal) {
  if (ts.scale < 1 && nowReal >= ts.until) ts.scale = 1;
  return ts.scale;
}

// -------------------------------------------------------- squash & stretch ---
// A pop: the entity's scale starts at a stretched pose and springs back to
// exactly 1 with an ease-out-back overshoot. Retriggering restarts the pop.
export function createPop() {
  return { sx: 1, sy: 1, sx0: 1, sy0: 1, t: 1, dur: 0.18, active: false };
}

export function popStart(pop, sx, sy) {
  pop.sx0 = sx; pop.sy0 = sy; pop.sx = sx; pop.sy = sy; pop.t = 0; pop.active = true;
}

export function popUpdate(pop, dt) {
  if (!pop.active) return;
  pop.t += dt / pop.dur;
  if (pop.t >= 1) { pop.sx = 1; pop.sy = 1; pop.active = false; return; }
  // easeOutBack on the offset from 1: overshoots past 1, settles at exactly 1.
  const c1 = 1.70158, c3 = c1 + 1;
  const u = pop.t - 1;
  const f = 1 + c3 * u * u * u + c1 * u * u;
  pop.sx = 1 + (pop.sx0 - 1) * (1 - f);
  pop.sy = 1 + (pop.sy0 - 1) * (1 - f);
}
