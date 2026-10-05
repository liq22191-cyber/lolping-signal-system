import { DEFAULT_SETTINGS, overlaySettings } from '../src/shared/settings';
import { emit } from './overlayShim';

const KEY = 'lolping-site-sound';
let soundOn = true;
let hushed = false;

try {
  soundOn = localStorage.getItem(KEY) !== 'off';
} catch {
  /* storage blocked: keep the default */
}

function push(): void {
  emit('overlay:settings', overlaySettings({ ...DEFAULT_SETTINGS, muted: !soundOn || hushed }));
}

export const isSoundOn = (): boolean => soundOn;

export function setSoundOn(on: boolean): void {
  soundOn = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* storage blocked: the choice lasts for this visit */
  }
  push();
}

/**
 * Silences the automatic demo. It runs before the visitor has clicked anything, so the browser would hold its
 * sounds and play them late, all at once, on the first click.
 */
export function setHushed(on: boolean): void {
  hushed = on;
  push();
}

push();
