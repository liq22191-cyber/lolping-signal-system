import { DEFAULT_EMOTE_WHEEL, isEmoteId, type EmoteId } from './emotes';
import { LANGUAGE_PREFS, strings, type Lang, type LanguagePref } from './i18n';
import { HOTKEY_PRIMARY_MODS, MOD, type Hotkey, vkLabel } from './keys';
import { DEFAULT_CLICK_PING, DEFAULT_WHEEL, isPingId, type PingId } from './pings';
import type { Platform } from './platform';
import { isTagColor } from './roomColors';
import { parseRoomCode } from './roomCode';
import { sanitizeName } from './roomProtocol';
import { isValidWheel, isValidWheelOf } from './wheelLayout';

export type NamedTrigger = 'alt' | 'ctrl' | 'shift' | 'win' | 'capslock' | 'mouse4' | 'mouse5';
export type TriggerKey = NamedTrigger | { vk: number };
export const NAMED_TRIGGERS: readonly NamedTrigger[] = ['alt', 'ctrl', 'shift', 'win', 'capslock', 'mouse4', 'mouse5'];

/** Keyboard triggers offered on each platform. macOS can't reliably stop Caps Lock from toggling, so it isn't offered. */
export const keyboardTriggers = (platform: Platform): NamedTrigger[] =>
  platform === 'mac' ? ['alt', 'ctrl', 'shift', 'win'] : ['alt', 'ctrl', 'shift', 'win', 'capslock'];

export interface Settings {
  version: 1;
  enabledOnStart: boolean;
  trigger: TriggerKey;
  dragThresholdPx: number;
  clickPing: boolean;
  /** Which ping trigger + click places. */
  clickPingId: PingId;
  /** The wheel's slices, top (N) then clockwise. */
  wheel: PingId[];
  /** Opens the emote wheel: hold it and drag with the left button. Never equal to `trigger`. */
  emoteTrigger: TriggerKey;
  /** The emote wheel's slices, top (N) then clockwise. */
  emoteWheel: EmoteId[];
  emoteSizePx: number;
  emoteDurationS: number;
  toggleHotkey: Hotkey;
  pingSizePx: number;
  pingDurationS: number;
  volume: number;
  muted: boolean;
  tickSound: boolean;
  launchAtStartup: boolean;
  language: LanguagePref;
  /** Shown under your pings on other people's screens. */
  displayName: string;
  /** Index into TAG_COLORS. */
  tagColor: number;
  /** Pings per second accepted from each room member; 0 = unlimited. */
  incomingPingLimit: number;
  allowInternet: boolean;
  rejoinRoom: boolean;
  /** Canonical code of the room to rejoin on launch. */
  lastRoomCode: string | null;
  roomMuted: boolean;
}

/** Per-machine defaults for the room profile: the OS username and a random tag colour. */
export interface Identity {
  name: string;
  color: number;
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  enabledOnStart: true,
  trigger: 'alt',
  dragThresholdPx: 8,
  clickPing: false,
  clickPingId: DEFAULT_CLICK_PING,
  wheel: [...DEFAULT_WHEEL],
  emoteTrigger: 'ctrl',
  emoteWheel: [...DEFAULT_EMOTE_WHEEL],
  emoteSizePx: 160,
  emoteDurationS: 3.2,
  toggleHotkey: { mods: MOD.ctrl | MOD.alt, vk: 0x50 },
  pingSizePx: 110,
  pingDurationS: 3.2,
  volume: 70,
  muted: false,
  tickSound: true,
  launchAtStartup: false,
  language: 'auto',
  displayName: 'Player',
  tagColor: 0,
  incomingPingLimit: 5,
  allowInternet: true,
  rejoinRoom: true,
  lastRoomCode: null,
  roomMuted: false,
};

export const LIMITS = {
  dragThresholdPx: { min: 2, max: 40, step: 1 },
  pingSizePx: { min: 60, max: 220, step: 1 },
  pingDurationS: { min: 1, max: 8, step: 0.1 },
  emoteSizePx: { min: 80, max: 320, step: 1 },
  emoteDurationS: { min: 1, max: 8, step: 0.1 },
  volume: { min: 0, max: 100, step: 1 },
  incomingPingLimit: { min: 0, max: 20, step: 1 },
} as const;

type NumKey = keyof typeof LIMITS;
type BoolKey = 'enabledOnStart' | 'clickPing' | 'muted' | 'tickSound' | 'launchAtStartup' | 'allowInternet' | 'rejoinRoom' | 'roomMuted';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isVk = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 254;

function num(raw: unknown, key: NumKey): number {
  const { min, max, step } = LIMITS[key];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_SETTINGS[key];
  const clamped = Math.min(max, Math.max(min, raw));
  return Number((Math.round(clamped / step) * step).toFixed(step < 1 ? 1 : 0));
}

const bool = (raw: unknown, key: BoolKey): boolean => (typeof raw === 'boolean' ? raw : DEFAULT_SETTINGS[key]);

function trigger(raw: unknown, platform: Platform): TriggerKey {
  if (platform === 'mac' && raw === 'capslock') return DEFAULT_SETTINGS.trigger;
  if (typeof raw === 'string' && (NAMED_TRIGGERS as readonly string[]).includes(raw)) return raw as NamedTrigger;
  if (isObj(raw) && isVk(raw.vk)) return { vk: raw.vk };
  return DEFAULT_SETTINGS.trigger;
}

export const sameTrigger = (a: TriggerKey, b: TriggerKey): boolean =>
  typeof a === 'object' && typeof b === 'object' ? a.vk === b.vk : a === b;

/** The emote trigger is keyboard-only (the drag always uses the left button) and never the ping trigger. */
function emoteTrigger(raw: unknown, platform: Platform, pingTrigger: TriggerKey): TriggerKey {
  let t: TriggerKey | null = null;
  if (typeof raw === 'string' && raw !== 'mouse4' && raw !== 'mouse5' && (NAMED_TRIGGERS as readonly string[]).includes(raw)) {
    if (!(platform === 'mac' && raw === 'capslock')) t = raw as NamedTrigger;
  } else if (isObj(raw) && isVk(raw.vk)) {
    t = { vk: raw.vk };
  }
  if (t && !sameTrigger(t, pingTrigger)) return t;
  for (const candidate of [DEFAULT_SETTINGS.emoteTrigger, 'alt', 'shift', 'win'] as TriggerKey[]) {
    if (!sameTrigger(candidate, pingTrigger)) return candidate;
  }
  return { vk: 0x56 }; // 'V': unreachable unless every named modifier is the ping trigger
}

function hotkey(raw: unknown): Hotkey {
  // Needs Ctrl, Alt or Win: a Shift-only hotkey would swallow ordinary capital letters system-wide.
  if (
    isObj(raw) && Number.isInteger(raw.mods) && (raw.mods as number) >= 1 && (raw.mods as number) <= 15
    && ((raw.mods as number) & HOTKEY_PRIMARY_MODS) !== 0 && isVk(raw.vk)
  ) {
    return { mods: raw.mods as number, vk: raw.vk };
  }
  return { ...DEFAULT_SETTINGS.toggleHotkey };
}

function roomCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const parsed = parseRoomCode(raw);
  return parsed.ok ? parsed.code : null;
}

const DEFAULT_IDENTITY: Identity = { name: DEFAULT_SETTINGS.displayName, color: DEFAULT_SETTINGS.tagColor };

/** Turns anything (parsed JSON, IPC payloads) into a complete, valid Settings object for `platform`. */
export function normalizeSettings(raw: unknown, platform: Platform = 'win', identity: Identity = DEFAULT_IDENTITY): Settings {
  const r = isObj(raw) ? raw : {};
  const fallbackName = sanitizeName(identity.name);
  const pingTrigger = trigger(r.trigger, platform);
  return {
    version: 1,
    enabledOnStart: bool(r.enabledOnStart, 'enabledOnStart'),
    trigger: pingTrigger,
    dragThresholdPx: num(r.dragThresholdPx, 'dragThresholdPx'),
    clickPing: bool(r.clickPing, 'clickPing'),
    clickPingId: isPingId(r.clickPingId) ? r.clickPingId : DEFAULT_CLICK_PING,
    wheel: isValidWheel(r.wheel) ? [...r.wheel] : [...DEFAULT_WHEEL],
    emoteTrigger: emoteTrigger(r.emoteTrigger, platform, pingTrigger),
    emoteWheel: isValidWheelOf(r.emoteWheel, isEmoteId) ? [...r.emoteWheel] : [...DEFAULT_EMOTE_WHEEL],
    emoteSizePx: num(r.emoteSizePx, 'emoteSizePx'),
    emoteDurationS: num(r.emoteDurationS, 'emoteDurationS'),
    toggleHotkey: hotkey(r.toggleHotkey),
    pingSizePx: num(r.pingSizePx, 'pingSizePx'),
    pingDurationS: num(r.pingDurationS, 'pingDurationS'),
    volume: num(r.volume, 'volume'),
    muted: bool(r.muted, 'muted'),
    tickSound: bool(r.tickSound, 'tickSound'),
    launchAtStartup: bool(r.launchAtStartup, 'launchAtStartup'),
    language: (LANGUAGE_PREFS as readonly unknown[]).includes(r.language) ? (r.language as LanguagePref) : DEFAULT_SETTINGS.language,
    displayName: typeof r.displayName === 'string' ? sanitizeName(r.displayName, fallbackName) : fallbackName,
    tagColor: isTagColor(r.tagColor) ? r.tagColor : isTagColor(identity.color) ? identity.color : 0,
    incomingPingLimit: num(r.incomingPingLimit, 'incomingPingLimit'),
    allowInternet: bool(r.allowInternet, 'allowInternet'),
    rejoinRoom: bool(r.rejoinRoom, 'rejoinRoom'),
    lastRoomCode: roomCode(r.lastRoomCode),
    roomMuted: bool(r.roomMuted, 'roomMuted'),
  };
}

export function mergeSettings(current: Settings, patch: Partial<Settings>, platform: Platform = 'win', identity?: Identity): Settings {
  return normalizeSettings({ ...current, ...patch }, platform, identity);
}

type KeyTrigger = Exclude<NamedTrigger, 'mouse4' | 'mouse5'>;
const KEY_LABELS: Record<Platform, Record<KeyTrigger, string>> = {
  win: { alt: 'Alt', ctrl: 'Ctrl', shift: 'Shift', win: 'Win', capslock: 'Caps Lock' },
  mac: { alt: '⌥ Option', ctrl: '⌃ Control', shift: '⇧ Shift', win: '⌘ Command', capslock: '⇪ Caps Lock' },
};

export function triggerLabel(t: TriggerKey, lang: Lang = 'en', platform: Platform = 'win'): string {
  if (typeof t === 'object') return vkLabel(t.vk, platform);
  if (t === 'mouse4' || t === 'mouse5') return strings(lang)[t];
  return KEY_LABELS[platform][t];
}

export type OverlaySettings = Pick<
  Settings,
  | 'pingSizePx' | 'pingDurationS' | 'volume' | 'muted' | 'tickSound' | 'wheel' | 'clickPingId'
  | 'emoteWheel' | 'emoteSizePx' | 'emoteDurationS'
>;

export const overlaySettings = (s: Settings): OverlaySettings => ({
  pingSizePx: s.pingSizePx, pingDurationS: s.pingDurationS, volume: s.volume, muted: s.muted, tickSound: s.tickSound,
  wheel: [...s.wheel], clickPingId: s.clickPingId,
  emoteWheel: [...s.emoteWheel], emoteSizePx: s.emoteSizePx, emoteDurationS: s.emoteDurationS,
});
