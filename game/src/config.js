// Abyssal Bloom — every tuning number and colour in one place.
// Theme "Abyssal Bloom": a dark teal abyss where the only light is alive.
// Cyan is the player and the common glow, gold is XP and reward, magenta is
// rare and dangerous, red-orange is hurt. The playfield is a fixed 1280x720
// logical area; the renderer scales it to the window, so no rule below
// depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 16,
  hp: 100,
  speed: 300,
  fireInterval: 0.45,
  damage: 10,
  projectileSpeed: 640,
  projectileRadius: 5,
  magnet: 90,
  dashSpeed: 950,
  dashTime: 0.12,
  dashCooldown: 2.5,
  dashInvuln: 0.25,
  hitInvuln: 0.5,
};

export const ENEMY = {
  /** Per-wave spawn budget and the cap on live enemies at once. */
  baseCount: 6,
  perWave: 3,
  maxAlive: 42,
  spawnInterval: 0.5,
  /** hp multiplier per wave above 1. */
  hpPerWave: 0.12,
  speedPerWave: 0.015,
  /** Seconds of quiet between waves. */
  breather: 2.0,
  bossEvery: 5,
  winWave: 10,
};

// ------------------------------------------------------------------ feel ---
// game-feel tiers: trauma^2 shake, hit-stop lengths, flash discipline.
// small = pickup (no stop), medium = normal hit, large = boss hit / death.
export const CFG = {
  shakeDecay: 1.2,   // trauma lost per real second
  shakeMaxX: 12,
  shakeMaxY: 8,
  hitStopMedium: 0.05,
  hitStopLarge: 0.12,
  hitStopSlow: 0.05, // time scale during a stop
  traumaSmall: 0.15,
  traumaMedium: 0.4,
  traumaLarge: 0.85,
  dashBuffer: 0.15,  // seconds of game time a dash press stays buffered
};

// ------------------------------------------------------- pacing as data ---
// level-design: intensity rises in a sawtooth with a rest before each spike.
// Wave 1 teaches (mites only, slow spawns); a boss wave is a climax and the
// wave before it gets a longer breather. Endless extrapolates past wave 10.
export const BEATS = [
  { type: 'teach',   intensity: 0.15, count: 6,  spawn: 0.9,  breather: 2.0 },
  { type: 'combat',  intensity: 0.35, count: 9,  spawn: 0.7,  breather: 2.0 },
  { type: 'combat',  intensity: 0.50, count: 12, spawn: 0.6,  breather: 2.0 },
  { type: 'combat',  intensity: 0.60, count: 15, spawn: 0.55, breather: 2.0 },
  { type: 'climax',  intensity: 0.90, count: 8,  spawn: 0.7,  breather: 3.5 },
  { type: 'combat',  intensity: 0.55, count: 18, spawn: 0.5,  breather: 2.0 },
  { type: 'combat',  intensity: 0.65, count: 21, spawn: 0.5,  breather: 2.0 },
  { type: 'combat',  intensity: 0.75, count: 24, spawn: 0.45, breather: 2.0 },
  { type: 'combat',  intensity: 0.65, count: 27, spawn: 0.45, breather: 2.0 },
  { type: 'climax',  intensity: 1.00, count: 10, spawn: 0.6,  breather: 3.5 },
];

/** The pacing beat for a wave (Endless waves extrapolate the last beat). */
export function waveBeat(wave) {
  if (wave <= BEATS.length) return BEATS[wave - 1];
  return {
    type: 'combat',
    intensity: Math.min(1, 0.75 + (wave - 10) * 0.03),
    count: 27 + (wave - 10) * 3,
    spawn: 0.45,
    breather: 2.0,
  };
}

/** Pacing sanity check (level-design Pattern 2): no >2 high beats in a row,
 *  a rest right before every climax, and the run opens with a teach beat. */
export function pacingProblems(beats) {
  const problems = [];
  let run = 0;
  for (let i = 0; i < beats.length; i += 1) {
    const b = beats[i];
    run = b.intensity >= 0.7 ? run + 1 : 0;
    if (run > 2) problems.push(`wave ${i + 1}: ${run} high-intensity beats in a row`);
    if (b.type === 'climax' && b.breather < 3) {
      problems.push(`wave ${i + 1}: no long rest right before the climax`);
    }
  }
  if (beats.length > 0 && beats[0].type !== 'teach') problems.push('wave 1: does not open with a teach beat');
  return problems;
}

/** XP needed to go from `level` to `level + 1`. */
export function xpNeeded(level) {
  return 6 + level * 6;
}

export const GEM = {
  pickupRadius: 22,
  magnetSpeed: 520,
  values: { small: 1, big: 5, rare: 20 },
};

export const PALETTE = {
  backdrop: '#04121a',
  waterTop: '#0a2e3d',
  waterBottom: '#04121a',
  ray: 'rgba(77, 232, 255, 0.05)',
  snow: 'rgba(190, 235, 245, 0.35)',
  player: '#4de8ff',
  playerCore: '#d8fbff',
  playerRing: '#1fb6d6',
  projectile: '#8ff4ff',
  gemSmall: '#4de8ff',
  gemBig: '#ffc44d',
  gemRare: '#ff5da2',
  mite: '#ff7a59',
  gulper: '#ff9f43',
  fangtooth: '#c77dff',
  spore: '#7ee081',
  boss: '#ff5da2',
  bossCore: '#ffd166',
  damage: '#ffffff',
  heal: '#7ee081',
  panel: 'rgba(4, 22, 32, 0.92)',
  panelEdge: '#1fb6d6',
  text: '#dff6ff',
  muted: '#6fa8b8',
  danger: '#ff6b5e',
  gold: '#ffc44d',
  xpBar: '#4de8ff',
  xpBarBack: '#0e2f3d',
  hpBar: '#ff5da2',
  hpBarBack: '#3a1526',
  dashReady: '#4de8ff',
  dashCool: '#2a5a6a',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'abyssal-bloom.best';
