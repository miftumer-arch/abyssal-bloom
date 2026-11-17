// render.js — everything the eye sees: the abyss field, the creatures, the
// glow. performance-optimization: the backdrop is painted once to an
// offscreen canvas and blitted; glow is a pre-rendered radial sprite per
// colour (no shadowBlur in the hot loop); marine snow is a fixed seeded
// array that wraps. The sim never draws and the renderer never simulates —
// it reads the world and the shake offset, and applies each entity's
// squash-and-stretch pop around its own centre.

import { FIELD, PALETTE, FONT } from './config.js';
import { createRandom } from './rng.js';
import { KIND_MITE, KIND_GULPER, KIND_FANGTOOTH, KIND_SPORE, KIND_BOSS } from './enemies.js';

function makeGlow(color) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.25, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

function paintBackdrop(seed) {
  const rng = createRandom(seed ^ 0x51ab3c);
  const c = document.createElement('canvas');
  c.width = FIELD.width;
  c.height = FIELD.height;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, FIELD.height);
  grad.addColorStop(0, PALETTE.waterTop);
  grad.addColorStop(1, PALETTE.waterBottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, FIELD.width, FIELD.height);

  // Light rays from the surface: a few soft wedges.
  for (let i = 0; i < 5; i += 1) {
    const x = rng() * FIELD.width;
    const w = 60 + rng() * 140;
    g.fillStyle = PALETTE.ray;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + w, 0);
    g.lineTo(x + w * 1.8, FIELD.height);
    g.lineTo(x - w * 0.4, FIELD.height);
    g.closePath();
    g.fill();
  }

  // Distant rock silhouettes along the floor.
  g.fillStyle = '#03101a';
  g.beginPath();
  g.moveTo(0, FIELD.height);
  let x = 0;
  while (x < FIELD.width) {
    const w = 90 + rng() * 180;
    const h = 40 + rng() * 90;
    g.lineTo(x + w / 2, FIELD.height - h);
    g.lineTo(x + w, FIELD.height);
    x += w;
  }
  g.lineTo(FIELD.width, FIELD.height);
  g.closePath();
  g.fill();

  // Coral fans at the edges: thin arcs in muted magenta/cyan.
  for (let i = 0; i < 7; i += 1) {
    const cx = rng() < 0.5 ? rng() * 120 : FIELD.width - rng() * 120;
    const cy = FIELD.height - 10 - rng() * 60;
    g.strokeStyle = i % 2 ? 'rgba(255, 93, 162, 0.25)' : 'rgba(77, 232, 255, 0.22)';
    g.lineWidth = 2;
    for (let a = 0; a < 5; a += 1) {
      const ang = -Math.PI / 2 + (a - 2) * 0.35;
      const len = 26 + rng() * 42;
      g.beginPath();
      g.moveTo(cx, cy);
      g.quadraticCurveTo(cx + Math.cos(ang) * len * 0.5, cy + Math.sin(ang) * len * 0.6,
        cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
      g.stroke();
    }
  }

  // Vignette: the edges of the abyss stay dark.
  const v = g.createRadialGradient(FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.42,
    FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.85);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = v;
  g.fillRect(0, 0, FIELD.width, FIELD.height);
  return c;
}

export function createRenderer(seed) {
  const backdrop = paintBackdrop(seed);
  const glows = {};
  function glow(color) {
    if (!glows[color]) glows[color] = makeGlow(color);
    return glows[color];
  }
  // Marine snow: fixed seeded drifters that wrap around the field.
  const snowRng = createRandom(seed ^ 0x77aa11);
  const snow = [];
  for (let i = 0; i < 90; i += 1) {
    snow.push({
      x: snowRng() * FIELD.width, y: snowRng() * FIELD.height,
      r: 0.6 + snowRng() * 1.8, speed: 6 + snowRng() * 18,
      phase: snowRng() * Math.PI * 2, sway: 4 + snowRng() * 10,
    });
  }

  function drawGlow(ctx, color, x, y, radius) {
    ctx.drawImage(glow(color), x - radius, y - radius, radius * 2, radius * 2);
  }

  function drawGem(ctx, g, time) {
    const pulse = 1 + 0.12 * Math.sin(time * 5 + g.x);
    const color = g.kind === 'rare' ? PALETTE.gemRare : g.kind === 'big' ? PALETTE.gemBig : PALETTE.gemSmall;
    const r = g.kind === 'rare' ? 9 : g.kind === 'big' ? 7 : 5;
    drawGlow(ctx, color, g.x, g.y, r * 3 * pulse);
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(Math.PI / 4);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = color;
    ctx.fillRect(-r / 1.4, -r / 1.4, r * 1.42, r * 1.42);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(-r / 3.4, -r / 3.4, r * 0.6, r * 0.6);
    ctx.restore();
  }

  function drawEnemy(ctx, e, time) {
    const t = e;
    ctx.save();
    ctx.translate(t.x, t.y);
    // Squash & stretch pop around the centre (game-feel).
    ctx.scale(t.pop.sx, t.pop.sy);
    const glowR = t.radius * (t.state === 'telegraph' ? 3.2 : 2.4);
    ctx.globalAlpha = 0.85;
    drawGlow(ctx, t.glow, 0, 0, glowR);
    ctx.globalAlpha = 1;
    // Body.
    const grad = ctx.createRadialGradient(-t.radius * 0.3, -t.radius * 0.3, 1, 0, 0, t.radius);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.35, t.color);
    grad.addColorStop(1, '#1a0b12');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, t.radius, 0, Math.PI * 2);
    ctx.fill();

    if (t.kind === KIND_MITE) {
      ctx.fillStyle = '#1a0b12';
      ctx.beginPath(); ctx.arc(-4, -3, 2.5, 0, Math.PI * 2); ctx.arc(4, -3, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = t.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-t.radius, 0); ctx.lineTo(-t.radius - 8, -5); ctx.moveTo(-t.radius, 0); ctx.lineTo(-t.radius - 8, 5); ctx.stroke();
    } else if (t.kind === KIND_GULPER) {
      ctx.fillStyle = '#2a0d12';
      ctx.beginPath(); ctx.arc(4, 4, t.radius * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-5, -6, 3, 0, Math.PI * 2); ctx.arc(6, -6, 3, 0, Math.PI * 2); ctx.fill();
    } else if (t.kind === KIND_FANGTOOTH) {
      // Teeth: white triangles, upper and lower.
      ctx.fillStyle = '#ffffff';
      for (let i = -1; i <= 1; i += 1) {
        ctx.beginPath();
        ctx.moveTo(i * 6 - 3, 2); ctx.lineTo(i * 6 + 3, 2); ctx.lineTo(i * 6, 9);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-5, -6, 3.4, 0, Math.PI * 2); ctx.arc(5, -6, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3d0a5e';
      ctx.beginPath(); ctx.arc(-5, -6, 1.7, 0, Math.PI * 2); ctx.arc(5, -6, 1.7, 0, Math.PI * 2); ctx.fill();
    } else if (t.kind === KIND_SPORE) {
      for (let i = 0; i < 3; i += 1) {
        const a = time * 1.5 + (i * Math.PI * 2) / 3;
        ctx.fillStyle = 'rgba(126, 224, 129, 0.9)';
        ctx.beginPath(); ctx.arc(Math.cos(a) * 8, Math.sin(a) * 8, 3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#12351a';
      ctx.beginPath(); ctx.arc(-4, -3, 2.5, 0, Math.PI * 2); ctx.arc(4, -3, 2.5, 0, Math.PI * 2); ctx.fill();
    } else if (t.kind === KIND_BOSS) {
      // Jaws: two dark arcs; lure: a stalk with a swinging gold light.
      ctx.strokeStyle = '#2a0d12'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, 6, t.radius * 0.62, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-16, -12, 5, 0, Math.PI * 2); ctx.arc(16, -12, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3d0a1e';
      ctx.beginPath(); ctx.arc(-16, -12, 2.5, 0, Math.PI * 2); ctx.arc(16, -12, 2.5, 0, Math.PI * 2); ctx.fill();
      const swing = Math.sin(time * 2.2) * 0.5;
      ctx.strokeStyle = '#ff5da2'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(0, -t.radius + 6); ctx.quadraticCurveTo(swing * 20, -t.radius - 22, swing * 30, -t.radius - 30); ctx.stroke();
      drawGlow(ctx, PALETTE.bossCore, swing * 30, -t.radius - 30, 16);
      ctx.fillStyle = PALETTE.bossCore;
      ctx.beginPath(); ctx.arc(swing * 30, -t.radius - 30, 4, 0, Math.PI * 2); ctx.fill();
    }

    // Telegraph: a pulsing warning ring — the fair warning before a charge.
    if (t.state === 'telegraph') {
      const pulse = 0.5 + 0.5 * Math.sin(time * 18);
      ctx.strokeStyle = `rgba(255, 196, 77, ${0.5 + 0.5 * pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, t.radius + 8 + pulse * 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Hit flash: a white overlay that fades in 0.09 s.
    if (t.flash > 0) {
      ctx.globalAlpha = Math.min(1, t.flash / 0.09);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 0, t.radius, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // Small hp bar when hurt (label-free but the bar itself is the signal).
    if (t.hp < t.maxHp && t.kind !== KIND_BOSS) {
      const w = t.radius * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(t.x - w / 2, t.y - t.radius - 10, w, 4);
      ctx.fillStyle = PALETTE.danger;
      ctx.fillRect(t.x - w / 2, t.y - t.radius - 10, w * (t.hp / t.maxHp), 4);
    }
  }

  function drawPlayer(ctx, p, time) {
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.dashT > 0) ctx.scale(1.3, 0.7); // dash stretch along the swim line
    else ctx.scale(p.pop.sx, p.pop.sy);
    // Hurt-invulnerability blink (not during the dash itself).
    if (p.invuln > 0 && p.dashT <= 0) ctx.globalAlpha = 0.55 + 0.35 * Math.sin(time * 30);
    drawGlow(ctx, PALETTE.player, 0, 0, 46);
    const grad = ctx.createRadialGradient(-5, -5, 2, 0, 0, p.radius);
    grad.addColorStop(0, PALETTE.playerCore);
    grad.addColorStop(0.5, PALETTE.player);
    grad.addColorStop(1, PALETTE.playerRing);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
    ctx.fill();
    // Tail fins, trailing opposite the facing direction.
    ctx.fillStyle = PALETTE.playerRing;
    ctx.beginPath();
    ctx.moveTo(-p.facingX * p.radius, -6);
    ctx.lineTo(-p.facingX * (p.radius + 10), -11);
    ctx.lineTo(-p.facingX * (p.radius + 6), 0);
    ctx.lineTo(-p.facingX * (p.radius + 10), 11);
    ctx.lineTo(-p.facingX * p.radius, 6);
    ctx.closePath();
    ctx.fill();
    // Eye, looking where the player faces.
    ctx.fillStyle = '#04202c';
    ctx.beginPath();
    ctx.arc(p.facingX * 6, p.facingY * 6 - 2, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(p.facingX * 7.5, p.facingY * 7.5 - 3, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  return {
    draw(ctx, world) {
      const time = world.time;
      ctx.save();
      // Trauma shake moves the camera only — never the bodies.
      ctx.translate(world.shake.x, world.shake.y);
      ctx.drawImage(backdrop, 0, 0);
      // Marine snow drifts down and sways; wraps around the field.
      ctx.fillStyle = PALETTE.snow;
      for (const s of snow) {
        const y = (s.y + time * s.speed) % FIELD.height;
        const x = s.x + Math.sin(time * 0.5 + s.phase) * s.sway;
        ctx.beginPath();
        ctx.arc(x, y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const g of world.gems) drawGem(ctx, g, time);
      for (const e of world.enemies) drawEnemy(ctx, e, time);
      // The player is drawn on every screen: on the title it is a decorative
      // swimmer in the corner; in play it is the hero.
      drawPlayer(ctx, world.player, time);
      // Projectiles: a glow dot and a bright core; crits are gold.
      for (const pr of world.combat.projectiles) {
        if (!pr.active) continue;
        const color = pr.crit ? PALETTE.gold : PALETTE.projectile;
        drawGlow(ctx, color, pr.x, pr.y, pr.radius * 3);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, pr.radius * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
      // Particles.
      for (const pt of world.combat.particles) {
        if (!pt.active) continue;
        ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // Damage numbers rise and fade.
      ctx.textAlign = 'center';
      for (const n of world.combat.numbers) {
        if (!n.active) continue;
        ctx.globalAlpha = Math.max(0, n.life / 0.8);
        ctx.fillStyle = n.color;
        ctx.font = `700 ${n.size}px ${FONT}`;
        ctx.fillText(n.text, n.x, n.y);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    },
  };
}
