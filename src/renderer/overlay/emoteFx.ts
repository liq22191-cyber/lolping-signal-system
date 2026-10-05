import { emoteUrl, type EmoteDef } from '../../shared/emotes';
import { FALLBACK_TEXTURE, textureUrl } from '../../shared/pings';

/** Safety ceiling, like MAX_PINGS: past this the oldest emotes go early. */
export const MAX_EMOTES = 30;

export interface EmoteFxOptions {
  sizePx: number;
  durationS: number;
}

/** Adds one emote at (x, y) — a pop, a short float, a fade — and removes it when its animation ends. */
export function spawnEmote(layer: HTMLElement, def: EmoteDef, x: number, y: number, opts: EmoteFxOptions): void {
  const root = document.createElement('div');
  root.className = 'emote';
  root.style.left = `${x}px`;
  root.style.top = `${y}px`;
  root.style.setProperty('--c', def.color);
  root.style.setProperty('--size', `${opts.sizePx}px`);
  root.style.setProperty('--dur', `${opts.durationS}s`);

  const img = document.createElement('img');
  img.src = emoteUrl(def.icon);
  img.onerror = () => {
    img.onerror = null;
    img.src = textureUrl(FALLBACK_TEXTURE);
  };
  root.append(img);

  while (layer.childElementCount >= MAX_EMOTES) layer.firstElementChild?.remove();
  layer.append(root);
  setTimeout(() => root.remove(), opts.durationS * 1000 + 150);
}
