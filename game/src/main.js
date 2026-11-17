// main.js — boot, the fixed-step loop, and the screen stack.
// game-engine: requestAnimationFrame drives rendering; the sim advances in
// fixed 1/60 steps (at most 5 per frame, spiral-guarded) and never depends
// on the display rate. Rendering reads the world; it never simulates.
// In `?shot=` mode the world is staged once (shots.js) and then frozen —
// the loop keeps drawing the same frame so a screenshot tool can capture it.
import { FIELD, STEP } from './config.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createWorld, update, clickLevelUp } from './world.js';
import { createRenderer } from './render.js';
import { drawHUD, drawTitle, drawPaused, drawLevelUp, drawVictory, drawGameOver } from './hud.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = FIELD.width;
canvas.height = FIELD.height;

const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') || '1') || 1;
const shot = params.get('shot');

const audio = createAudio();
const input = createInput(canvas);
const world = createWorld(audio, seed);
const renderer = createRenderer(seed);

// One scaling policy (game-ui-ux): the 1280x720 logical field scales to
// fit the window, letterboxed, so the layout is identical everywhere.
function fit() {
  const scale = Math.min(window.innerWidth / FIELD.width, window.innerHeight / FIELD.height);
  canvas.style.width = `${Math.floor(FIELD.width * scale)}px`;
  canvas.style.height = `${Math.floor(FIELD.height * scale)}px`;
}
window.addEventListener('resize', fit);
fit();

// Audio needs a user gesture; any pointer press unlocks it.
canvas.addEventListener('pointerdown', () => audio.unlock());

let frozen = false;
if (shot) {
  stageShot(world, shot);
  frozen = true;
}

// Debug/testing handle: the headless playtest drives the game through this.
window.__abyss = { world, input, audio, ready: true, shot: shot || null };

let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const realDt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!frozen) {
    acc += realDt;
    let n = 0;
    while (acc >= STEP && n < 5) {
      update(world, input, STEP);
      acc -= STEP;
      n += 1;
    }
    if (n === 5) acc = 0; // spiral guard: drop time rather than spiral
    // Level-up cards are clickable: map the click into logical coords.
    const click = input.takeClick();
    if (click && world.screen === 'levelup') {
      clickLevelUp(world,
        click.x * (FIELD.width / click.width),
        click.y * (FIELD.height / click.height));
    }
  }
  renderer.draw(ctx, world);
  if (world.screen === 'playing' || world.screen === 'paused' || world.screen === 'levelup') {
    drawHUD(ctx, world);
  }
  if (world.screen === 'title') drawTitle(ctx, world);
  else if (world.screen === 'paused') drawPaused(ctx);
  else if (world.screen === 'levelup') drawLevelUp(ctx, world);
  else if (world.screen === 'victory') drawVictory(ctx, world);
  else if (world.screen === 'gameover') drawGameOver(ctx, world);
}
requestAnimationFrame(frame);
