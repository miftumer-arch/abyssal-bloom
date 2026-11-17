// Projectiles, particles and damage numbers. Everything is pooled once at
// boot and reused, so the simulation allocates nothing while it runs.

import { FIELD, PALETTE } from './config.js';

const PROJECTILE_POOL = 96;
const PARTICLE_POOL = 256;
const NUMBER_POOL = 48;

export function createCombat() {
  const projectiles = [];
  for (let i = 0; i < PROJECTILE_POOL; i += 1) {
    projectiles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, damage: 0, pierce: 0, radius: 5, crit: false });
  }
  const particles = [];
  for (let i = 0; i < PARTICLE_POOL; i += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 2, color: '#fff', drag: 0.9 });
  }
  const numbers = [];
  for (let i = 0; i < NUMBER_POOL; i += 1) {
    numbers.push({ active: false, x: 0, y: 0, life: 0, text: '', color: PALETTE.damage, size: 16 });
  }

  function free(list) {
    for (let i = 0; i < list.length; i += 1) if (!list[i].active) return list[i];
    return null;
  }

  return {
    projectiles,
    particles,
    numbers,

    fire(x, y, angle, speed, damage, pierce, radius, crit) {
      const p = free(projectiles);
      if (!p) return;
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.damage = damage;
      p.pierce = pierce;
      p.radius = radius;
      p.crit = crit;
    },

    burst(x, y, color, count, speed, size) {
      for (let i = 0; i < count; i += 1) {
        const p = free(particles);
        if (!p) return;
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.3 + Math.random() * 0.7);
        p.active = true;
        p.x = x;
        p.y = y;
        p.vx = Math.cos(a) * v;
        p.vy = Math.sin(a) * v;
        p.maxLife = 0.35 + Math.random() * 0.45;
        p.life = p.maxLife;
        p.size = size * (0.6 + Math.random() * 0.8);
        p.color = color;
        p.drag = 0.88;
      }
    },

    ring(x, y, color, count, speed, size) {
      for (let i = 0; i < count; i += 1) {
        const p = free(particles);
        if (!p) return;
        const a = (i / count) * Math.PI * 2;
        p.active = true;
        p.x = x;
        p.y = y;
        p.vx = Math.cos(a) * speed;
        p.vy = Math.sin(a) * speed;
        p.maxLife = 0.5;
        p.life = 0.5;
        p.size = size;
        p.color = color;
        p.drag = 0.94;
      }
    },

    number(x, y, text, color, size) {
      const n = free(numbers);
      if (!n) return;
      n.active = true;
      n.x = x;
      n.y = y;
      n.life = 0.8;
      n.text = text;
      n.color = color;
      n.size = size || 16;
    },

    step(dt) {
      for (const p of projectiles) {
        if (!p.active) continue;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.x < -20 || p.x > FIELD.width + 20 || p.y < -20 || p.y > FIELD.height + 20) p.active = false;
      }
      for (const p of particles) {
        if (!p.active) continue;
        p.life -= dt;
        if (p.life <= 0) { p.active = false; continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= p.drag;
        p.vy *= p.drag;
      }
      for (const n of numbers) {
        if (!n.active) continue;
        n.life -= dt;
        n.y -= 42 * dt;
        if (n.life <= 0) n.active = false;
      }
    },

    clear() {
      for (const p of projectiles) p.active = false;
      for (const p of particles) p.active = false;
      for (const n of numbers) n.active = false;
    },
  };
}
