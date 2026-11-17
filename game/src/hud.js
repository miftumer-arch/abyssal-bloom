// hud.js — everything drawn on top of the world: the in-play HUD and the
// title / pause / level-up / victory / game-over screens.
// game-ui-ux: one scaling policy (the whole UI lives in the fixed 1280x720
// logical space and scales with the canvas), HUD anchored to the corners,
// critical info inside the safe area, every screen focuses one control on
// open (the level-up cards get a visible focus ring, navigable with arrows,
// 1/2/3, Enter or click), text never below 16 px at this resolution and
// never colour alone (bars carry numbers and labels).

import { FIELD, PALETTE, FONT, ENEMY } from './config.js';
import { levelUpCardRects } from './world.js';
import { UPGRADES } from './upgrades.js';

function bar(ctx, x, y, w, h, ratio, back, fill, label) {
  ctx.fillStyle = back;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, ratio)), h);
  ctx.strokeStyle = 'rgba(223, 246, 255, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  if (label) {
    ctx.fillStyle = PALETTE.text;
    ctx.font = `600 13px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 8, y + h / 2 + 0.5);
  }
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);
}

// ------------------------------------------------------------ in-play HUD ---
export function drawHUD(ctx, world) {
  const p = world.player;
  ctx.save();
  // Top-left: health (number + label, not colour alone) and XP.
  ctx.textBaseline = 'alphabetic';
  bar(ctx, 20, 20, 260, 22, p.hp / p.maxHp, PALETTE.hpBarBack, PALETTE.hpBar,
    `HP ${Math.ceil(p.hp)} / ${p.maxHp}`);
  bar(ctx, 20, 48, 260, 12, p.xp / p.xpNeed, PALETTE.xpBarBack, PALETTE.xpBar, '');
  ctx.fillStyle = PALETTE.text;
  ctx.font = `600 14px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(`LEVEL ${p.level}`, 20, 78);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `13px ${FONT}`;
  ctx.fillText(`XP ${p.xp} / ${p.xpNeed}`, 96, 78);

  // Top-centre: wave and run clock.
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.text;
  ctx.font = `700 22px ${FONT}`;
  ctx.fillText(world.wave === 0 ? 'GET READY' : `WAVE ${world.wave}${world.endless ? ' — ENDLESS' : ''}`, FIELD.width / 2, 36);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `15px ${FONT}`;
  ctx.fillText(fmtTime(world.runTime), FIELD.width / 2, 58);

  // Top-right: score and best.
  ctx.textAlign = 'right';
  ctx.fillStyle = PALETTE.gold;
  ctx.font = `700 22px ${FONT}`;
  ctx.fillText(`SCORE ${world.score}`, FIELD.width - 20, 36);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `14px ${FONT}`;
  ctx.fillText(`BEST ${Math.max(world.best, world.score)}`, FIELD.width - 20, 58);

  // Boss bar under the wave label (label + bar, never colour alone).
  if (world.boss) {
    const b = world.boss;
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.boss;
    ctx.font = `700 15px ${FONT}`;
    ctx.fillText('ANGLER — THE DEEP MAW', FIELD.width / 2, 84);
    bar(ctx, FIELD.width / 2 - 220, 92, 440, 14, b.hp / b.maxHp, PALETTE.hpBarBack, PALETTE.boss, '');
  }

  // Bottom-left: dash cooldown (icon + bar + READY text).
  const dashRatio = 1 - Math.max(0, p.dashCd) / p.dashCooldown;
  ctx.textAlign = 'left';
  ctx.fillStyle = p.dashCd <= 0 ? PALETTE.dashReady : PALETTE.muted;
  ctx.font = `700 14px ${FONT}`;
  ctx.fillText(p.dashCd <= 0 ? 'DASH READY  [SPACE]' : 'DASH…', 20, FIELD.height - 44);
  bar(ctx, 20, FIELD.height - 36, 120, 10,
    dashRatio, PALETTE.xpBarBack, p.dashCd <= 0 ? PALETTE.dashReady : PALETTE.dashCool, '');

  // Bottom-right: controls reminder.
  ctx.textAlign = 'right';
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `13px ${FONT}`;
  ctx.fillText('WASD move · SPACE dash · P pause · M mute', FIELD.width - 20, FIELD.height - 20);

  // Breather banner: the next wave, counting down.
  if (world.waveState === 'breather' && world.screen === 'playing') {
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 30px ${FONT}`;
    ctx.fillText(`WAVE ${world.wave} INCOMING`, FIELD.width / 2, FIELD.height / 2 - 90);
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `700 44px ${FONT}`;
    ctx.fillText(String(Math.ceil(world.breatherT)), FIELD.width / 2, FIELD.height / 2 - 44);
  }

  // Hurt vignette: a red edge flash (never a full-screen flash — photosensitivity).
  if (p.hurtFlash > 0) {
    const a = Math.min(0.5, p.hurtFlash * 1.4);
    const g = ctx.createRadialGradient(FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.35,
      FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.75);
    g.addColorStop(0, 'rgba(255, 60, 60, 0)');
    g.addColorStop(1, `rgba(255, 60, 60, ${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- screens ---
function title(ctx, text, y, size, color) {
  ctx.fillStyle = color || PALETTE.text;
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, FIELD.width / 2, y);
}

function sub(ctx, text, y, size, color) {
  ctx.fillStyle = color || PALETTE.muted;
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(text, FIELD.width / 2, y);
}

export function drawTitle(ctx, world) {
  ctx.save();
  // Dim the field behind the title.
  ctx.fillStyle = 'rgba(4, 18, 26, 0.55)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  title(ctx, 'ABYSSAL BLOOM', 210, 76, PALETTE.player);
  sub(ctx, 'a deep-sea arena survival', 252, 22, PALETTE.muted);
  title(ctx, 'Dive. Survive. Bloom.', 320, 26, PALETTE.gold);
  sub(ctx, 'WASD / arrows — swim      SPACE — dash      auto-fire is always on', 420, 18);
  sub(ctx, 'Defeat the waves, gather glow-gems, choose upgrades,', 452, 18);
  sub(ctx, 'and slay the Angler on wave 10 to win.', 478, 18);
  if (world.best > 0) sub(ctx, `Best score: ${world.best}`, 522, 18, PALETTE.gold);
  // The focused control: a pulsing prompt (the only action on this screen).
  const pulse = 0.6 + 0.4 * Math.sin(world.realTime * 4);
  ctx.globalAlpha = pulse;
  title(ctx, 'PRESS SPACE OR CLICK TO DIVE', 590, 26, PALETTE.text);
  ctx.globalAlpha = 1;
  sub(ctx, 'P pause · M mute', 640, 15);
  ctx.restore();
}

export function drawPaused(ctx) {
  ctx.save();
  ctx.fillStyle = 'rgba(4, 18, 26, 0.7)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  title(ctx, 'PAUSED', 300, 56);
  sub(ctx, 'P or SPACE — resume      R — restart run', 360, 19);
  ctx.restore();
}

export function drawLevelUp(ctx, world) {
  ctx.save();
  ctx.fillStyle = 'rgba(4, 18, 26, 0.72)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  title(ctx, `LEVEL ${world.player.level} — CHOOSE ONE`, 190, 40, PALETTE.gold);
  sub(ctx, 'Arrows or 1 / 2 / 3 to pick · Enter or click to confirm', 224, 17);
  const rects = levelUpCardRects();
  for (let i = 0; i < 3; i += 1) {
    const offer = world.offers[i];
    const r = rects[i];
    const selected = i === world.selectedOffer;
    panel(ctx, r.x, r.y, r.w, r.h);
    if (selected) {
      // Focus ring: the focused card is unmistakable (game-ui-ux).
      ctx.strokeStyle = PALETTE.gold;
      ctx.lineWidth = 3;
      ctx.strokeRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6);
      ctx.fillStyle = 'rgba(255, 196, 77, 0.08)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    if (!offer) continue;
    const taken = world.taken[offer.id] || 0;
    const max = UPGRADES.find((u) => u.id === offer.id)?.max || 99;
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `700 15px ${FONT}`;
    ctx.fillText(`[ ${i + 1} ]`, r.x + r.w / 2, r.y + 30);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 21px ${FONT}`;
    ctx.fillText(offer.name, r.x + r.w / 2, r.y + 66);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `17px ${FONT}`;
    ctx.fillText(offer.desc, r.x + r.w / 2, r.y + 100);
    // Level pips: how many times taken / max (not colour alone).
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `14px ${FONT}`;
    ctx.fillText(max >= 99 ? 'repeatable' : `${'●'.repeat(taken)}${'○'.repeat(Math.max(0, max - taken))}`, r.x + r.w / 2, r.y + 150);
    if (selected) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `700 15px ${FONT}`;
      ctx.fillText('— SELECTED —', r.x + r.w / 2, r.y + 182);
    }
  }
  ctx.restore();
}

function statsBlock(ctx, world, y0) {
  const cleared = world.screen === 'victory' ? world.wave : Math.max(0, world.wave - 1);
  const lines = [
    `Waves cleared: ${cleared}`,
    `Kills: ${world.kills}`,
    `Time: ${Math.floor(world.runTime / 60)}:${String(Math.floor(world.runTime % 60)).padStart(2, '0')}`,
    `Score: ${world.score}`,
  ];
  ctx.textAlign = 'center';
  lines.forEach((line, i) => sub(ctx, line, y0 + i * 30, 19, PALETTE.text));
  return y0 + lines.length * 30;
}

export function drawVictory(ctx, world) {
  ctx.save();
  ctx.fillStyle = 'rgba(4, 18, 26, 0.6)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  title(ctx, 'THE BLOOM SURVIVES', 220, 56, PALETTE.gold);
  sub(ctx, 'The Angler of wave 10 is down. The abyss is yours — for now.', 262, 20);
  const y = statsBlock(ctx, world, 330);
  const pulse = 0.6 + 0.4 * Math.sin(world.realTime * 4);
  ctx.globalAlpha = pulse;
  title(ctx, 'ENTER — DIVE DEEPER (ENDLESS)', y + 56, 24, PALETTE.player);
  ctx.globalAlpha = 1;
  sub(ctx, 'R — play again', y + 92, 18);
  ctx.restore();
}

export function drawGameOver(ctx, world) {
  ctx.save();
  ctx.fillStyle = 'rgba(26, 4, 10, 0.62)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  title(ctx, 'THE ABYSS CLAIMS YOU', 210, 52, PALETTE.danger);
  sub(ctx, `Slain on wave ${world.wave} by a ${world.deathCause || 'creature of the deep'}.`, 256, 20);
  const y = statsBlock(ctx, world, 320);
  sub(ctx, `Best score: ${world.best}`, y + 8, 18, PALETTE.gold);
  const pulse = 0.6 + 0.4 * Math.sin(world.realTime * 4);
  ctx.globalAlpha = pulse;
  title(ctx, 'PRESS SPACE TO DIVE AGAIN', y + 70, 24, PALETTE.text);
  ctx.globalAlpha = 1;
  ctx.restore();
}
