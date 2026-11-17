// shots.js — deterministic screenshot staging for `?shot=` poses.
// Each shot is a fixed seed + a fixed scripted playthrough, so the same URL
// always renders the same frame: start = title, play = mid-wave action with
// HUD, levelup = the choice screen, end = the game-over screen. The caller
// freezes the sim after staging and renders the frozen frame.
import { STEP } from './config.js';
import { ACTION_DASH } from './input.js';
import { startRun, update, applyOffer } from './world.js';

function fakeInput(dirFn, actionFn) {
  return { direction: dirFn, takeActions: actionFn, takeClick: () => null };
}

// Autopilot: flee the nearest enemy when it gets close, otherwise swim to
// the nearest glow-gem, otherwise drift to the centre. Deterministic: it
// reads only world state, so the same seed stages the same game.
function autopilotDir(world) {
  const p = world.player;
  let ne = null;
  let nd = Infinity;
  for (const e of world.enemies) {
    const d = (e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y);
    if (d < nd) { nd = d; ne = e; }
  }
  let dx = 0;
  let dy = 0;
  if (ne && nd < 120 * 120) { dx = p.x - ne.x; dy = p.y - ne.y; }
  else if (world.gems.length > 0) {
    let g = null;
    let gd = Infinity;
    for (const gem of world.gems) {
      const d = (gem.x - p.x) * (gem.x - p.x) + (gem.y - p.y) * (gem.y - p.y);
      if (d < gd) { gd = d; g = gem; }
    }
    dx = g.x - p.x; dy = g.y - p.y;
  } else { dx = 640 - p.x; dy = 360 - p.y; }
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

export function stageShot(world, shot) {
  if (shot === 'start') return; // the title screen, as created
  startRun(world);

  if (shot === 'end') {
    // Stand still and let the abyss come: a real, deterministic death.
    const input = fakeInput(() => ({ x: 0, y: 0 }), () => 0);
    for (let i = 0; i < 60 * 120 && world.screen !== 'gameover'; i += 1) {
      update(world, input, STEP);
      if (world.screen === 'levelup') applyOffer(world, 0);
    }
    return;
  }

  // play / levelup: the autopilot plays until the target state.
  let steps = 0;
  const maxSteps = 60 * 45;
  let actions = 0;
  const input = fakeInput(
    () => autopilotDir(world),
    () => { const a = actions; actions = 0; return a; },
  );
  while (steps < maxSteps) {
    steps += 1;
    const p = world.player;
    let close = false;
    for (const e of world.enemies) {
      if ((e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y) < 70 * 70) { close = true; break; }
    }
    if (close && p.dashCd <= 0) actions |= ACTION_DASH;
    update(world, input, STEP);
    if (world.screen === 'levelup') {
      if (shot === 'levelup') return; // freeze on the choice screen
      applyOffer(world, 0); // keep playing for the play shot
    }
    if (world.screen === 'gameover') startRun(world); // unlucky run: restart, keep staging
    // Freeze when the action is visible around the player: several enemies
    // close to the player (inside the viewport) and a pulse in flight, so
    // the still frame reads dense. Fallback: the original mid-spawn moment.
    const pulseFlying = world.combat.projectiles.some((pr) => pr.active);
    let near = 0;
    for (const e of world.enemies) {
      const dx = e.x - world.player.x;
      const dy = e.y - world.player.y;
      if (dx * dx + dy * dy < 450 * 450) near += 1;
    }
    if (shot === 'play' && steps > 60 * 8 && (
      (world.wave >= 3 && near >= 4 && pulseFlying)
      || (world.wave >= 3 && world.enemies.length >= 5 && world.spawnLeft <= 7 && pulseFlying)
    )) return;
  }
}
