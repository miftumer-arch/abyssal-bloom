// Keyboard and pointer input. Held keys give a movement vector; one-shot
// presses (confirm, dash, pause, mute, level-up choices) are queued as bit
// flags and taken once by the loop, so a press between two frames is never
// lost and never counted twice. Pointer clicks are reported with position
// so the level-up cards are clickable.

export const ACTION_CONFIRM = 1;
export const ACTION_DASH = 2;
export const ACTION_PAUSE = 4;
export const ACTION_MUTE = 8;
export const ACTION_CHOICE_1 = 16;
export const ACTION_CHOICE_2 = 32;
export const ACTION_CHOICE_3 = 64;
export const ACTION_PREV = 128;
export const ACTION_NEXT = 256;
export const ACTION_RESTART = 512;

const MOVE = {
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};
// Space is confirm on menus AND dash in play (the world decides by screen);
// Shift is dash only. Arrows double as card navigation on the level-up
// screen (edge flags); in play they are plain movement.
const CONFIRM = new Set(['Space', 'Enter']);
const DASH = new Set(['Space', 'ShiftLeft', 'ShiftRight']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);
const PREV = new Set(['ArrowLeft', 'ArrowUp']);
const NEXT = new Set(['ArrowRight', 'ArrowDown']);
const RESTART = new Set(['KeyR']);
const CHOICE = { Digit1: ACTION_CHOICE_1, Digit2: ACTION_CHOICE_2, Digit3: ACTION_CHOICE_3, Numpad1: ACTION_CHOICE_1, Numpad2: ACTION_CHOICE_2, Numpad3: ACTION_CHOICE_3 };

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  let click = null;

  window.addEventListener('keydown', (event) => {
    if (MOVE[event.code]) {
      held.add(event.code);
      // Arrows also nudge the level-up card selection (edge flag); in play
      // the flag is simply ignored.
      if (!event.repeat) {
        if (PREV.has(event.code)) actions |= ACTION_PREV;
        if (NEXT.has(event.code)) actions |= ACTION_NEXT;
      }
      event.preventDefault();
    } else if (CONFIRM.has(event.code)) {
      // Space is both confirm (menus) and dash (play): set both flags, the
      // world consumes the one its current screen needs.
      if (!event.repeat) actions |= ACTION_CONFIRM | (DASH.has(event.code) ? ACTION_DASH : 0);
      event.preventDefault();
    } else if (DASH.has(event.code)) {
      if (!event.repeat) actions |= ACTION_DASH;
      event.preventDefault();
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
      event.preventDefault();
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (CHOICE[event.code]) {
      if (!event.repeat) actions |= CHOICE[event.code];
    } else if (PREV.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PREV;
    } else if (NEXT.has(event.code)) {
      if (!event.repeat) actions |= ACTION_NEXT;
    } else if (RESTART.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    }
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => held.clear());
  target.addEventListener('pointerdown', (event) => {
    const rect = target.getBoundingClientRect();
    click = { x: event.clientX - rect.left, y: event.clientY - rect.top, width: rect.width, height: rect.height };
    actions |= ACTION_CONFIRM;
  });

  return {
    /** Normalised movement vector {x, y} from held keys. */
    direction() {
      let x = 0;
      let y = 0;
      for (const code of held) {
        const m = MOVE[code];
        if (m) { x += m[0]; y += m[1]; }
      }
      if (x === 0 && y === 0) return { x: 0, y: 0 };
      const len = Math.hypot(x, y);
      return { x: x / len, y: y / len };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The last pointer click in CSS pixels relative to the canvas, or null. */
    takeClick() {
      const taken = click;
      click = null;
      return taken;
    },
  };
}
