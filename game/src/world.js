// world.js — the game state and the fixed-step simulation.
// Screens are a stack (game-ui-ux): title, playing, levelup and paused are
// overlays on the same world; only the top screen takes input. The sim runs
// only while the screen is 'playing', on a fixed 1/60 step, and is separate
// from rendering. All tuning lives in config.js; this file is the rules.
//
// roguelike: one run seed, split into per-purpose sub-seeds (waves, spawns,
// offers) so playing wave 1 differently can never change wave 3's layout.
// game-feel: every impact goes through feedback(tier, x, y) — one call fires
// the tier's sound + particles + shake + hit-stop bundle, so the whole game
// stays proportional. level-design: waves follow the BEATS table in
// config.js (teach -> ramp -> rest -> climax).

import {
  FIELD, STEP, PLAYER, ENEMY, GEM, CFG, PALETTE,
  xpNeeded, waveBeat,
} from './config.js';
import { createRandom } from './rng.js';
import {
  TYPES, KIND_MITE, KIND_GULPER, KIND_SPORE, KIND_BOSS,
  kindsForWave, isBossWave, edgePoint,
  createEnemy, updateEnemyAI,
} from './enemies.js';
import { createCombat } from './combat.js';
import { drawOffers } from './upgrades.js';
import {
  createShake, addTrauma, updateShake,
  createTimeScale, hitStop, updateTimeScale,
  popStart, popUpdate,
} from './feel.js';
import {
  ACTION_CONFIRM, ACTION_DASH, ACTION_PAUSE, ACTION_MUTE,
  ACTION_CHOICE_1, ACTION_CHOICE_2, ACTION_CHOICE_3,
  ACTION_PREV, ACTION_NEXT, ACTION_RESTART,
} from './input.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAYING = 'playing';
export const SCREEN_LEVELUP = 'levelup';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_VICTORY = 'victory';
export const SCREEN_GAMEOVER = 'gameover';

function freshPlayer() {
  return {
    x: FIELD.width / 2, y: FIELD.height / 2, vx: 0, vy: 0,
    radius: PLAYER.radius, hp: PLAYER.hp, maxHp: PLAYER.hp,
    speed: PLAYER.speed, fireInterval: PLAYER.fireInterval,
    damage: PLAYER.damage, magnet: PLAYER.magnet,
    dashCooldown: PLAYER.dashCooldown, dashCd: 0, dashT: 0,
    invuln: 0, fireT: 0.2, hurtFlash: 0,
    projectiles: 1, pierce: 0, crit: 0, dashRing: false,
    level: 1, xp: 0, xpNeed: xpNeeded(1),
    facingX: 1, facingY: 0, pop: null,
  };
}

export function createWorld(audio, seed) {
  const world = {
    audio,
    seed,
    screen: SCREEN_TITLE,
    time: 0,          // game time (hit-stop slows it; pause freezes it)
    realTime: 0,      // wall time inside the sim, for hit-stop restore
    runTime: 0,       // seconds survived this run (the score clock)
    wave: 0,
    waveState: 'breather',
    spawnLeft: 0, spawnT: 0, breatherT: 0,
    player: null,
    enemies: [],
    gems: [],
    boss: null,
    offers: [],
    selectedOffer: 0,
    pendingLevels: 0,
    taken: {},
    kills: 0,
    score: 0,
    endless: false,
    deathCause: '',
    shake: createShake(),
    timeScale: createTimeScale(),
    combat: createCombat(),
    // One run seed, per-purpose sub-seeds (roguelike).
    rngWave: createRandom(seed ^ 0x9e3779b9),
    rngSpawn: createRandom(seed ^ 0x51ed2703),
    rngOffer: createRandom(seed ^ 0x2b992ddf),
    rngCombat: createRandom(seed ^ 0x7f4a7c15),
    dashBufferedAt: -10,
    pickupChain: 0,
    pickupChainT: 0,
    maxDistFromSpawn: 0, // debug: farthest the player ever swam from the centre
    best: 0,
  };
  world.player = freshPlayer();
  world.player.pop = { sx: 1, sy: 1, sx0: 1, sy0: 1, t: 1, dur: 0.18, active: false };
  // Title-screen dressing: the player idles in the lower-right corner and a
  // few creatures drift at the edges. startRun() clears all of this, so the
  // run itself always starts clean at the centre.
  world.player.x = 1050;
  world.player.y = 540;
  world.enemies.push(createEnemy(KIND_MITE, 180, 180, 1));
  world.enemies.push(createEnemy(KIND_GULPER, 1150, 170, 1));
  world.enemies.push(createEnemy(KIND_MITE, 220, 570, 1));
  try { world.best = Number(window.localStorage.getItem('abyssal-bloom.best') || 0) || 0; } catch { world.best = 0; }
  return world;
}

export function startRun(world) {
  world.screen = SCREEN_PLAYING;
  world.time = 0;
  world.runTime = 0;
  world.wave = 0;
  world.enemies.length = 0;
  world.gems.length = 0;
  world.boss = null;
  world.offers = [];
  world.pendingLevels = 0;
  world.taken = {};
  world.kills = 0;
  world.score = 0;
  world.endless = false;
  world.deathCause = '';
  world.player = freshPlayer();
  world.player.pop = { sx: 1, sy: 1, sx0: 1, sy0: 1, t: 1, dur: 0.18, active: false };
  world.combat.clear();
  world.dashBufferedAt = -10;
  world.pickupChain = 0;
  world.pickupChainT = 0;
  beginBreather(world, 1);
  world.audio.setIntensity(0.1);
}

function beginBreather(world, wave) {
  world.wave = wave;
  world.waveState = 'breather';
  world.breatherT = waveBeat(wave).breather;
  world.spawnLeft = 0;
}

function beginWave(world) {
  const wave = world.wave;
  const beat = waveBeat(wave);
  world.waveState = 'spawning';
  world.spawnLeft = beat.count;
  world.spawnT = 0;
  if (isBossWave(wave)) {
    const p = edgePoint(world.rngSpawn, world.player.x, world.player.y);
    const boss = createEnemy(KIND_BOSS, p.x, p.y, wave);
    world.enemies.push(boss);
    world.boss = boss;
    world.audio.boss();
    world.audio.setIntensity(0.9);
    feedback(world, 'large', boss.x, boss.y);
  } else {
    world.audio.setIntensity(Math.min(1, 0.15 + beat.intensity * 0.6));
  }
}

// ------------------------------------------------------------- feedback ---
// game-feel tiers: small = pickup (tick + few particles, no stop), medium =
// normal hit / hurt (flash + 0.05 s stop), large = boss hit / death (flash +
// zoom-scale numbers + 0.12 s stop + music duck). One call, whole bundle.
export function feedback(world, tier, x, y) {
  if (tier === 'small') {
    addTrauma(world.shake, CFG.traumaSmall);
    world.combat.burst(x, y, PALETTE.gemSmall, 4, 120, 2);
  } else if (tier === 'medium') {
    addTrauma(world.shake, CFG.traumaMedium);
    hitStop(world.timeScale, CFG.hitStopMedium, CFG.hitStopSlow, world.realTime);
    world.combat.burst(x, y, '#ffffff', 10, 220, 3);
  } else if (tier === 'large') {
    addTrauma(world.shake, CFG.traumaLarge);
    hitStop(world.timeScale, CFG.hitStopLarge, CFG.hitStopSlow, world.realTime);
    world.combat.burst(x, y, PALETTE.boss, 28, 320, 4);
    world.combat.ring(x, y, PALETTE.gold, 16, 260, 3);
    world.audio.duck();
  }
}

// ------------------------------------------------------------------ sim ---
function spawnOne(world) {
  const kinds = kindsForWave(world.wave);
  let kind = kinds[Math.floor(world.rngSpawn() * kinds.length)];
  // roguelike out-of-depth: ~5% of spawns are one tier deeper.
  if (world.rngSpawn() < 0.05) {
    const deeper = kinds[kinds.length - 1];
    if (deeper !== KIND_MITE) kind = deeper;
  }
  const p = edgePoint(world.rngSpawn, world.player.x, world.player.y);
  world.enemies.push(createEnemy(kind, p.x, p.y, world.wave));
}

function dropGem(world, x, y, value) {
  // Gems are the one list that grows with kills: cap it so a long Endless
  // run can't accumulate unbounded objects (oldest small gems are skipped).
  if (world.gems.length >= 300 && value < 5) return;
  if (world.gems.length >= 400) return;
  const kind = value >= 20 ? 'rare' : value >= 5 ? 'big' : 'small';
  world.gems.push({ x, y, vx: 0, vy: 0, value, kind, active: true });
}

function killEnemy(world, e, idx) {
  e.dead = true;
  world.enemies.splice(idx, 1);
  world.kills += 1;
  world.score += e.score;
  const isBoss = e.kind === KIND_BOSS;
  // XP gems: the enemy's xp value, split into small/big/rare gems.
  let remaining = e.xp;
  while (remaining >= 20) { dropGem(world, e.x, e.y, 20); remaining -= 20; }
  while (remaining >= 5) { dropGem(world, e.x, e.y, 5); remaining -= 5; }
  while (remaining >= 1) { dropGem(world, e.x, e.y, 1); remaining -= 1; }
  world.combat.burst(e.x, e.y, e.color, isBoss ? 30 : 12, isBoss ? 340 : 240, 3);
  world.combat.number(e.x, e.y, `+${e.score}`, PALETTE.gold, isBoss ? 26 : 16);
  if (e.kind === KIND_SPORE) {
    // A spore splits into two mites where it died.
    for (let i = 0; i < 2; i += 1) {
      const m = createEnemy(KIND_MITE, e.x + (i === 0 ? -14 : 14), e.y, world.wave);
      world.enemies.push(m);
    }
  }
  if (isBoss) {
    world.boss = null;
    world.audio.duck();
    feedback(world, 'large', e.x, e.y);
    world.combat.number(e.x, e.y - 30, 'BOSS DOWN', PALETTE.bossCore, 30);
  } else {
    feedback(world, 'medium', e.x, e.y);
  }
  world.audio.hit();
}

function hurtPlayer(world, e) {
  const p = world.player;
  if (p.invuln > 0 || p.dashT > 0) return;
  p.hp -= e.damage;
  p.invuln = PLAYER.hitInvuln;
  p.hurtFlash = 0.35;
  popStart(p.pop, 1.25, 0.75);
  // Knock the player away from the hit.
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  p.x += (dx / d) * 18;
  p.y += (dy / d) * 18;
  world.audio.hurt();
  feedback(world, 'medium', p.x, p.y);
  if (p.hp <= 0) {
    p.hp = 0;
    world.deathCause = TYPES[e.kind].name;
    gameOver(world);
  }
}

function gameOver(world) {
  world.screen = SCREEN_GAMEOVER;
  world.audio.gameover();
  feedback(world, 'large', world.player.x, world.player.y);
  if (world.score > world.best) {
    world.best = world.score;
    try { window.localStorage.setItem('abyssal-bloom.best', String(world.best)); } catch { /* private mode */ }
  }
}

function victory(world) {
  world.screen = SCREEN_VICTORY;
  world.audio.victory();
  world.audio.duck();
  if (world.score > world.best) {
    world.best = world.score;
    try { window.localStorage.setItem('abyssal-bloom.best', String(world.best)); } catch { /* private mode */ }
  }
}

function gainXp(world, value) {
  const p = world.player;
  p.xp += value;
  while (p.xp >= p.xpNeed) {
    p.xp -= p.xpNeed;
    p.level += 1;
    p.xpNeed = xpNeeded(p.level);
    world.pendingLevels += 1;
  }
  if (world.pendingLevels > 0 && world.screen === SCREEN_PLAYING) {
    world.offers = drawOffers(world.rngOffer, world.taken);
    world.selectedOffer = 0;
    world.screen = SCREEN_LEVELUP;
    world.audio.levelup();
    feedback(world, 'small', p.x, p.y);
  }
}

export function applyOffer(world, index) {
  const offer = world.offers[index];
  if (!offer) return;
  offer.apply(world.player);
  world.taken[offer.id] = (world.taken[offer.id] || 0) + 1;
  world.pendingLevels -= 1;
  if (world.pendingLevels > 0) {
    world.offers = drawOffers(world.rngOffer, world.taken);
    world.selectedOffer = 0;
  } else {
    world.offers = [];
    world.screen = SCREEN_PLAYING;
  }
}

function tryDash(world, dir) {
  const p = world.player;
  if (p.dashCd > 0 || p.dashT > 0) {
    // input-systems: buffer the press (game time) so an early dash still fires.
    world.dashBufferedAt = world.time;
    return;
  }
  p.dashT = PLAYER.dashTime;
  p.dashCd = p.dashCooldown;
  p.invuln = Math.max(p.invuln, PLAYER.dashInvuln);
  const dx = dir.x !== 0 || dir.y !== 0 ? dir.x : p.facingX;
  const dy = dir.x !== 0 || dir.y !== 0 ? dir.y : p.facingY;
  p.vx = dx * PLAYER.dashSpeed;
  p.vy = dy * PLAYER.dashSpeed;
  world.audio.dash();
  feedback(world, 'small', p.x, p.y);
  if (p.dashRing) {
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      world.combat.fire(p.x, p.y, a, PLAYER.projectileSpeed, p.damage, p.pierce, PLAYER.projectileRadius, false);
    }
  }
}

function autoFire(world) {
  const p = world.player;
  p.fireT -= STEP;
  if (p.fireT > 0 || world.enemies.length === 0) return;
  // Nearest living enemy.
  let best = null;
  let bestD = Infinity;
  for (const e of world.enemies) {
    const d = (e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  if (!best) return;
  p.fireT = p.fireInterval;
  const base = Math.atan2(best.y - p.y, best.x - p.x);
  const n = p.projectiles;
  for (let i = 0; i < n; i += 1) {
    const spread = (i - (n - 1) / 2) * 0.09;
    const crit = world.rngCombat() < p.crit;
    world.combat.fire(p.x, p.y, base + spread, PLAYER.projectileSpeed,
      crit ? p.damage * 2 : p.damage, p.pierce, PLAYER.projectileRadius, crit);
  }
  world.audio.shoot();
}

function stepPlaying(world, input) {
  const p = world.player;
  const dt = STEP * updateTimeScale(world.timeScale, world.realTime);
  world.time += dt;
  world.runTime += dt;
  updateShake(world.shake, STEP); // real dt: shake decays during hit-stop
  popUpdate(p.pop, dt);
  if (p.invuln > 0) p.invuln -= dt;
  if (p.hurtFlash > 0) p.hurtFlash -= dt;
  if (p.dashCd > 0) p.dashCd -= dt;
  if (world.pickupChainT > 0) { world.pickupChainT -= dt; if (world.pickupChainT <= 0) world.pickupChain = 0; }

  const actions = input.takeActions();
  const dir = input.direction();
  if (actions & ACTION_PAUSE) { world.screen = SCREEN_PAUSED; return; }
  // Mute is handled once, globally, in update() — not here (double toggle).
  if (actions & ACTION_DASH) tryDash(world, dir);
  // A buffered dash fires the moment the cooldown ends (0.15 s window).
  if (p.dashCd <= 0 && world.time - world.dashBufferedAt <= CFG.dashBuffer) {
    world.dashBufferedAt = -10;
    tryDash(world, dir);
  }

  // --- player movement (dash overrides steering while it lasts) ---
  if (p.dashT > 0) {
    p.dashT -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.dashT <= 0) { p.vx = 0; p.vy = 0; }
  } else {
    if (dir.x !== 0 || dir.y !== 0) { p.facingX = dir.x; p.facingY = dir.y; }
    p.x += dir.x * p.speed * dt;
    p.y += dir.y * p.speed * dt;
  }
  p.x = Math.max(p.radius, Math.min(FIELD.width - p.radius, p.x));
  p.y = Math.max(p.radius, Math.min(FIELD.height - p.radius, p.y));
  const distFromSpawn = Math.hypot(p.x - FIELD.width / 2, p.y - FIELD.height / 2);
  if (distFromSpawn > world.maxDistFromSpawn) world.maxDistFromSpawn = distFromSpawn;

  autoFire(world);

  // --- waves ---
  if (world.waveState === 'breather') {
    world.breatherT -= dt;
    if (world.breatherT <= 0) beginWave(world);
  } else if (world.waveState === 'spawning') {
    world.spawnT -= dt;
    if (world.spawnT <= 0 && world.spawnLeft > 0 && world.enemies.length < ENEMY.maxAlive) {
      spawnOne(world);
      world.spawnLeft -= 1;
      world.spawnT = waveBeat(world.wave).spawn;
    }
    if (world.spawnLeft <= 0) world.waveState = 'fighting';
  } else if (world.waveState === 'fighting' && world.enemies.length === 0) {
    // Wave cleared: bonus score, then the next wave's breather (the rest
    // beat before the next spike — level-design sawtooth).
    world.score += world.wave * 50;
    world.audio.waveclear();
    if (world.wave === ENEMY.winWave && !world.endless) {
      victory(world);
      return;
    }
    beginBreather(world, world.wave + 1);
  }

  // --- enemies: AI, integrate, separate ---
  for (const e of world.enemies) {
    updateEnemyAI(e, p.x, p.y, dt);
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.x = Math.max(-60, Math.min(FIELD.width + 60, e.x));
    e.y = Math.max(-60, Math.min(FIELD.height + 60, e.y));
    if (e.flash > 0) e.flash -= dt;
    popUpdate(e.pop, dt);
    if (e.spawnRequest > 0) {
      for (let i = 0; i < e.spawnRequest; i += 1) {
        if (world.enemies.length >= ENEMY.maxAlive) break;
        const m = createEnemy(KIND_MITE, e.x + (world.rngSpawn() - 0.5) * 60, e.y + (world.rngSpawn() - 0.5) * 60, world.wave);
        world.enemies.push(m);
      }
      e.spawnRequest = 0;
    }
  }
  // Separation: cheap pairwise push so enemies don't stack on one point.
  const list = world.enemies;
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i];
      const b = list[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = a.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0.01 && d2 < min * min) {
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
      }
    }
  }

  // --- projectiles vs enemies ---
  const combat = world.combat;
  for (const pr of combat.projectiles) {
    if (!pr.active) continue;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const e = list[i];
      const dx = e.x - pr.x;
      const dy = e.y - pr.y;
      const rr = e.radius + pr.radius;
      if (dx * dx + dy * dy > rr * rr) continue;
      e.hp -= pr.damage;
      e.flash = 0.09;
      popStart(e.pop, 1.3, 0.7);
      // Knockback along the shot (game-feel: impacts move bodies a little).
      const d = Math.hypot(pr.vx, pr.vy) || 1;
      e.x += (pr.vx / d) * 10;
      e.y += (pr.vy / d) * 10;
      combat.number(e.x, e.y - e.radius - 6, String(Math.round(pr.damage)), pr.crit ? PALETTE.gold : PALETTE.damage, pr.crit ? 22 : 15);
      combat.burst(pr.x, pr.y, e.color, 4, 160, 2);
      if (pr.pierce > 0) { pr.pierce -= 1; } else { pr.active = false; }
      if (e.hp <= 0) killEnemy(world, e, i);
      break; // one enemy per projectile per tick (unless piercing, it stays live)
    }
  }

  // --- contact damage ---
  for (const e of list) {
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const rr = p.radius + e.radius;
    if (dx * dx + dy * dy < rr * rr) {
      hurtPlayer(world, e);
      if (world.screen !== SCREEN_PLAYING) return;
    }
  }

  // --- gems: magnet + pickup ---
  for (let i = world.gems.length - 1; i >= 0; i -= 1) {
    const g = world.gems[i];
    const dx = p.x - g.x;
    const dy = p.y - g.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < p.magnet) {
      g.x += (dx / d) * GEM.magnetSpeed * dt;
      g.y += (dy / d) * GEM.magnetSpeed * dt;
    }
    if (d < GEM.pickupRadius) {
      world.gems.splice(i, 1);
      world.pickupChain += 1;
      world.pickupChainT = 0.6;
      world.audio.pickup(Math.min(world.pickupChain, 12));
      feedback(world, 'small', g.x, g.y);
      gainXp(world, g.value);
      if (world.screen !== SCREEN_PLAYING) return;
    }
  }

  combat.step(dt);
}

// ------------------------------------------------------------- update ---
// One fixed step. `input` is the input handle; `realDt` is the frame's real
// dt (STEP in the fixed loop). Screens other than playing only handle their
// own keys — the sim never advances under an overlay.
export function update(world, input, realDt) {
  world.realTime += realDt;
  const actions = input.takeActions();
  // Mute works on every screen.
  if (actions & ACTION_MUTE) world.audio.toggleMute();

  if (world.screen === SCREEN_TITLE) {
    if (actions & (ACTION_CONFIRM | ACTION_RESTART)) {
      world.audio.unlock();
      startRun(world);
    }
    return;
  }
  if (world.screen === SCREEN_PAUSED) {
    if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) world.screen = SCREEN_PLAYING;
    if (actions & ACTION_RESTART) { world.audio.unlock(); startRun(world); }
    return;
  }
  if (world.screen === SCREEN_LEVELUP) {
    if (actions & ACTION_PREV) world.selectedOffer = (world.selectedOffer + 2) % 3;
    if (actions & ACTION_NEXT) world.selectedOffer = (world.selectedOffer + 1) % 3;
    if (actions & ACTION_CHOICE_1) applyOffer(world, 0);
    else if (actions & ACTION_CHOICE_2) applyOffer(world, 1);
    else if (actions & ACTION_CHOICE_3) applyOffer(world, 2);
    else if (actions & ACTION_CONFIRM) applyOffer(world, world.selectedOffer);
    // Clicks are handled by main.js (it maps the click to a card first).
    return;
  }
  if (world.screen === SCREEN_VICTORY) {
    if (actions & ACTION_CONFIRM) {
      // Dive deeper: Endless continues from wave 11.
      world.endless = true;
      world.screen = SCREEN_PLAYING;
      beginBreather(world, ENEMY.winWave + 1);
    } else if (actions & ACTION_RESTART) {
      world.audio.unlock();
      startRun(world);
    }
    return;
  }
  if (world.screen === SCREEN_GAMEOVER) {
    if (actions & (ACTION_CONFIRM | ACTION_RESTART)) {
      world.audio.unlock();
      startRun(world);
    }
    return;
  }
  // Playing: the step consumes the actions itself (dash buffer needs them).
  // NOTE: takeActions() above already drained this frame's flags — re-queue
  // the playing-relevant ones by re-reading them from the drained set.
  stepPlayingWithActions(world, input, actions);
}

function stepPlayingWithActions(world, input, drained) {
  // The playing step needs the raw flags; wrap input so takeActions returns
  // the drained set once, then behaves normally.
  let first = true;
  const wrapped = {
    direction: () => input.direction(),
    takeActions: () => {
      if (first) { first = false; return drained; }
      return input.takeActions();
    },
    takeClick: () => input.takeClick(),
  };
  stepPlaying(world, wrapped);
}

// Click on a level-up card (coordinates in logical 1280x720 space).
export function clickLevelUp(world, x, y) {
  if (world.screen !== SCREEN_LEVELUP) return false;
  const cards = levelUpCardRects();
  for (let i = 0; i < cards.length; i += 1) {
    const c = cards[i];
    if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) {
      applyOffer(world, i);
      return true;
    }
  }
  return false;
}

// Card geometry, shared with hud.js so clicks and drawing agree.
export function levelUpCardRects() {
  const w = 300;
  const h = 210;
  const gap = 30;
  const total = w * 3 + gap * 2;
  const x0 = (FIELD.width - total) / 2;
  const y = 250;
  return [0, 1, 2].map((i) => ({ x: x0 + i * (w + gap), y, w, h }));
}
