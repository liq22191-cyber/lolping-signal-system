import { allEmoteTextureNames, emoteById, emoteUrl, emotesFor, type EmoteDef } from '../../shared/emotes';
import {
  DEFAULT_CLICK_PING, TICK_SOUND, allSoundNames, allTextureNames, pingById, pingsFor, textureUrl, type PingDef,
} from '../../shared/pings';
import type { PingTag } from '../../shared/ipc';
import { DEFAULT_SETTINGS, overlaySettings, type OverlaySettings } from '../../shared/settings';
import { spawnEmote } from './emoteFx';
import { spawnPing } from './pingFx';
import { SoundBank } from './soundBank';
import { showToast } from './toast';
import { Wheel } from './wheel';

const pingLayer = document.getElementById('pings') as HTMLElement;
const toastLayer = document.getElementById('toasts') as HTMLElement;
const svg = document.getElementById('wheel') as unknown as SVGSVGElement;
const emoteSvg = document.getElementById('emoteWheel') as unknown as SVGSVGElement;

const sounds = new SoundBank();
let settings: OverlaySettings = overlaySettings(DEFAULT_SETTINGS);
const [fallbackPing] = pingsFor([DEFAULT_CLICK_PING]);
const fallbackEmote = emotesFor(['wellplayed'])[0];
const volume = (): number => (settings.muted ? 0 : settings.volume / 100);

const onHover = (): void => {
  if (settings.tickSound) sounds.play(TICK_SOUND, volume() * 0.5);
};
const wheel = new Wheel<PingDef>(svg, onHover, { centerIcon: textureUrl('generic_ping'), centerText: 'PING' });
const emoteWheel = new Wheel<EmoteDef>(emoteSvg, onHover, { centerText: 'EMOTE' });
wheel.setItems(pingsFor(settings.wheel), (p) => textureUrl(p.icon));
emoteWheel.setItems(emotesFor(settings.emoteWheel), (e) => emoteUrl(e.icon));

function ping(def: PingDef, x: number, y: number, tag?: PingTag): void {
  spawnPing(pingLayer, def, x, y, { sizePx: settings.pingSizePx, durationS: settings.pingDurationS, tag });
  sounds.play(def.sound, volume());
}

function emote(def: EmoteDef, x: number, y: number): void {
  spawnEmote(pingLayer, def, x, y, { sizePx: settings.emoteSizePx, durationS: settings.emoteDurationS });
}

window.overlay.on('overlay:settings', (s) => {
  settings = s;
  wheel.setItems(pingsFor(s.wheel), (p) => textureUrl(p.icon));
  emoteWheel.setItems(emotesFor(s.emoteWheel), (e) => emoteUrl(e.icon));
});
window.overlay.on('wheel:open', (p) => wheel.open(p.x, p.y));
window.overlay.on('wheel:move', (p) => wheel.move(p.x, p.y));
window.overlay.on('wheel:release', (p) => {
  const chosen = wheel.release(p.x, p.y);
  if (!chosen) return;
  ping(chosen.item, chosen.x, chosen.y);
  window.overlay.reportPing(chosen.item.id, chosen.x, chosen.y);
});
window.overlay.on('wheel:cancel', () => wheel.cancel());
window.overlay.on('emoteWheel:open', (p) => emoteWheel.open(p.x, p.y));
window.overlay.on('emoteWheel:move', (p) => emoteWheel.move(p.x, p.y));
window.overlay.on('emoteWheel:release', (p) => {
  const chosen = emoteWheel.release(p.x, p.y);
  if (chosen) emote(chosen.item, chosen.x, chosen.y);
});
window.overlay.on('emoteWheel:cancel', () => emoteWheel.cancel());
window.overlay.on('ping:spawn', (p) => ping(pingById(p.id) ?? fallbackPing, p.x, p.y, p.tag));
window.overlay.on('emote:spawn', (p) => emote(emoteById(p.id) ?? fallbackEmote, p.x, p.y));
window.overlay.on('toast:show', (t) => showToast(toastLayer, t.title, t.body));

function checkTextures(): Promise<string[]> {
  const probe = (name: string, url: (n: string) => string, dir: string): Promise<string | null> =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(null);
      img.onerror = () => resolve(`${dir}/${name}.png`);
      img.src = url(name);
    });
  return Promise.all([
    ...allTextureNames().map((name) => probe(name, textureUrl, 'textures')),
    ...allEmoteTextureNames().map((name) => probe(name, emoteUrl, 'emotes')),
  ]).then((r) => r.filter((x): x is string => x !== null));
}

void Promise.all([sounds.load(allSoundNames()), checkTextures()]).then(([missingSounds, missingTextures]) => {
  const missing = [...missingSounds, ...missingTextures];
  if (missing.length > 0) window.overlay.reportMissingAssets(missing);
});
