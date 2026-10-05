import { WHEEL } from '../src/shared/geometry';
import { DEFAULT_SETTINGS } from '../src/shared/settings';
import { emit } from './overlayShim';

// Browser version of the helper's gesture logic. Inside the stage any drag opens the wheel (mouse or touch);
// anywhere else on the page it takes Alt + drag, like the app. A press without a drag drops a generic ping.
// Coordinates are page pixels: the overlay layer (#fx) covers the whole document.

const pageX = (e: PointerEvent): number => e.clientX + window.scrollX;
const pageY = (e: PointerEvent): number => e.clientY + window.scrollY;

/** Shrinks the wheel on small screens. Pointer offsets are divided by the same factor so slices match the drawing. */
export function wheelScale(): number {
  const room = Math.min(window.innerWidth, window.innerHeight) - 32;
  const scale = Math.min(1, room / (2 * WHEEL.outerR + 64));
  document.documentElement.style.setProperty('--wheel-scale', String(scale));
  return scale;
}

type Gesture =
  | { kind: 'idle' }
  | { kind: 'pending'; pointer: number; x: number; y: number }
  | { kind: 'wheel'; pointer: number; ox: number; oy: number; scale: number };

let gesture: Gesture = { kind: 'idle' };
let swallowClick = false; // an Alt + press landed on a link or button: don't let the click through
let altUsed = false; // Alt was held for a gesture: keep its release from focusing the browser menu
let swallowMenu = false; // a right-click cancelled the wheel: no context menu for it
const pingListeners: Array<() => void> = [];

export const onUserPing = (cb: () => void): void => {
  pingListeners.push(cb);
};

const toWheel = (g: { ox: number; oy: number; scale: number }, x: number, y: number) => ({
  x: g.ox + (x - g.ox) / g.scale,
  y: g.oy + (y - g.oy) / g.scale,
});

function cancel(): void {
  if (gesture.kind === 'wheel') emit('wheel:cancel', null);
  gesture = { kind: 'idle' };
}

export function initInput(stage: HTMLElement): void {
  window.addEventListener('pointerdown', (e) => {
    if (gesture.kind !== 'idle' || e.button !== 0 || !e.isPrimary) return;
    swallowClick = false;
    const alt = e.altKey && e.pointerType === 'mouse';
    if (!alt && !stage.contains(e.target as Node)) return;
    e.preventDefault(); // no text selection, no focus change
    if (alt) {
      altUsed = true;
      swallowClick = true;
    }
    gesture = { kind: 'pending', pointer: e.pointerId, x: pageX(e), y: pageY(e) };
  });

  window.addEventListener('pointermove', (e) => {
    if (gesture.kind === 'idle' || e.pointerId !== gesture.pointer) return;
    if (gesture.kind === 'pending') {
      if (Math.hypot(pageX(e) - gesture.x, pageY(e) - gesture.y) < DEFAULT_SETTINGS.dragThresholdPx) return;
      gesture = { kind: 'wheel', pointer: gesture.pointer, ox: gesture.x, oy: gesture.y, scale: wheelScale() };
      emit('wheel:open', { x: gesture.ox, y: gesture.oy });
    }
    emit('wheel:move', toWheel(gesture, pageX(e), pageY(e)));
  });

  window.addEventListener('pointerup', (e) => {
    if (gesture.kind === 'idle' || e.pointerId !== gesture.pointer) return;
    if (gesture.kind === 'wheel') emit('wheel:release', toWheel(gesture, pageX(e), pageY(e)));
    else emit('ping:spawn', { id: 'generic', x: gesture.x, y: gesture.y });
    gesture = { kind: 'idle' };
    for (const cb of pingListeners) cb();
  });

  window.addEventListener('pointercancel', (e) => {
    if (gesture.kind !== 'idle' && e.pointerId === gesture.pointer) cancel();
  });

  // A second button pressed during a drag arrives as a mouse event, not a pointerdown. Right-click cancels.
  window.addEventListener('mousedown', (e) => {
    if (e.button === 2 && gesture.kind !== 'idle') {
      cancel();
      swallowMenu = true;
    }
  });
  window.addEventListener('contextmenu', (e) => {
    if (gesture.kind === 'idle' && !swallowMenu) return;
    swallowMenu = false;
    e.preventDefault();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && gesture.kind !== 'idle') {
      e.preventDefault();
      cancel();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'Alt' && altUsed) {
      e.preventDefault();
      altUsed = false;
    }
  });
  window.addEventListener(
    'click',
    (e) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
  stage.addEventListener('dragstart', (e) => e.preventDefault());
}
