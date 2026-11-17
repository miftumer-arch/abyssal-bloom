// The level-up upgrade pool: each upgrade is a small card with a name, a
// one-line effect, and an apply() that mutates the player's stats. The
// world draws three distinct offers; this file only defines them.

export const UPGRADES = [
  {
    id: 'damage', name: 'Sharper Pulse', max: 5,
    desc: '+25% pulse damage',
    apply: (s) => { s.damage *= 1.25; },
  },
  {
    id: 'rate', name: 'Rapid Pulse', max: 5,
    desc: 'Fire 18% faster',
    apply: (s) => { s.fireInterval *= 0.82; },
  },
  {
    id: 'speed', name: 'Swift Fins', max: 5,
    desc: '+12% swim speed',
    apply: (s) => { s.speed *= 1.12; },
  },
  {
    id: 'vitality', name: 'Thick Hide', max: 5,
    desc: '+25 max health, heal 25',
    apply: (s) => { s.maxHp += 25; s.hp = Math.min(s.maxHp, s.hp + 25); },
  },
  {
    id: 'dash', name: 'Long Dash', max: 3,
    desc: 'Dash recharges 30% faster',
    apply: (s) => { s.dashCooldown *= 0.7; },
  },
  {
    id: 'magnet', name: 'Wide Magnet', max: 5,
    desc: '+70% gem magnet radius',
    apply: (s) => { s.magnet *= 1.7; },
  },
  {
    id: 'twin', name: 'Twin Pulse', max: 4,
    desc: '+1 projectile per shot',
    apply: (s) => { s.projectiles += 1; },
  },
  {
    id: 'pierce', name: 'Piercing Light', max: 3,
    desc: 'Pulses pierce +1 enemy',
    apply: (s) => { s.pierce += 1; },
  },
  {
    id: 'crit', name: 'Critical Glow', max: 5,
    desc: '+12% critical chance (x2 damage)',
    apply: (s) => { s.crit += 0.12; },
  },
  {
    id: 'ring', name: 'Adrenal Ring', max: 1,
    desc: 'Dashing fires a ring of 8 pulses',
    apply: (s) => { s.dashRing = true; },
  },
];

/** Draw three distinct offers the player has not maxed out yet. */
export function drawOffers(random, taken) {
  const available = UPGRADES.filter((u) => (taken[u.id] || 0) < u.max);
  const offers = [];
  while (offers.length < 3 && available.length > 0) {
    const index = Math.floor(random() * available.length);
    offers.push(available.splice(index, 1)[0]);
  }
  // If everything is maxed (deep endless), offer healing instead.
  while (offers.length < 3) {
    offers.push({ id: 'heal', name: 'Warm Current', max: 99, desc: 'Restore 40 health', apply: (s) => { s.hp = Math.min(s.maxHp, s.hp + 40); } });
  }
  return offers;
}
