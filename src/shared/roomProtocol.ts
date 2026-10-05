import { isPingId, type PingId } from './pings';
import { isTagColor } from './roomColors';

/** Bumped when room messages change incompatibly. Peers on another version are shown as "needs update". */
export const PROTOCOL_VERSION = 1;
export const MAX_NAME = 16;
const MAX_DISPLAY = 16;
const MAX_APP_VERSION = 64;

export type MemberStatus = 'on' | 'paused' | 'muted';
const STATUSES: readonly MemberStatus[] = ['on', 'paused', 'muted'];

interface Base {
  /** Random per launch, 16 lower-case hex characters. */
  peer: string;
  /** +1 for every message the peer sends. */
  seq: number;
  /** Sender's clock, ms since epoch. */
  ts: number;
}
export interface PresenceMsg extends Base {
  t: 'presence';
  proto: number;
  app: string;
  name: string;
  color: number;
  status: MemberStatus;
}
export interface PingMsg extends Base {
  t: 'ping';
  ping: PingId;
  /** Display number: 1 = primary. */
  d: number;
  /** Position as a fraction of that display, 0–1. */
  x: number;
  y: number;
}
export interface ByeMsg extends Base {
  t: 'bye';
}
export type RoomMessage = PresenceMsg | PingMsg | ByeMsg;

// C0/C1 controls, zero-width characters, bidi marks, embeddings and isolates, BOM, line/paragraph separators,
// soft hyphen, combining grapheme joiner, Arabic letter mark, Mongolian vowel separator and the Hangul fillers
// (blank characters that would make a name invisible).
const UNSAFE_CHARS =
  /[\u0000-\u001f\u007f-\u009f\u00ad\u034f\u061c\u115f\u1160\u180e\u200b-\u200f\u2028-\u202e\u2060-\u2069\u3164\ufeff\uffa0]/g;

/** While typing: at most MAX_NAME code points (an emoji counts once; maxLength would count UTF-16 units). */
export const clampNameInput = (v: string): string => [...v].slice(0, MAX_NAME).join('');

/** A display name that can't hide, reorder or break the text around it. */
export function sanitizeName(raw: string, fallback = 'Player'): string {
  const name = [...raw.replace(UNSAFE_CHARS, '').trim()].slice(0, MAX_NAME).join('').trim();
  return name || fallback;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isUint = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const isUnit = (v: unknown): v is number => typeof v === 'number' && v >= 0 && v <= 1;

/** Builds a fresh message from known fields only, or null when anything is missing or out of range. */
export function validateMessage(raw: unknown): RoomMessage | null {
  if (!isObj(raw)) return null;
  const { t, peer, seq, ts } = raw;
  if (typeof peer !== 'string' || !/^[0-9a-f]{16}$/.test(peer) || !isUint(seq) || !isUint(ts)) return null;
  const base = { peer, seq, ts };
  switch (t) {
    case 'presence': {
      const { proto, app, name, color, status } = raw;
      if (!isUint(proto) || typeof app !== 'string' || app.length > MAX_APP_VERSION || typeof name !== 'string') return null;
      if (!isTagColor(color) || !STATUSES.includes(status as MemberStatus)) return null;
      return { t, ...base, proto, app, name: sanitizeName(name.slice(0, 256)), color, status: status as MemberStatus };
    }
    case 'ping': {
      const { ping, d, x, y } = raw;
      if (!isPingId(ping) || !Number.isInteger(d) || (d as number) < 1 || (d as number) > MAX_DISPLAY) return null;
      if (!isUnit(x) || !isUnit(y)) return null;
      return { t, ...base, ping, d: d as number, x, y };
    }
    case 'bye':
      return { t, ...base };
    default:
      return null;
  }
}

const round4 = (v: number): number => Math.round(v * 10_000) / 10_000;

export function encodeMessage(m: RoomMessage): Uint8Array {
  const out = m.t === 'ping' ? { ...m, x: round4(m.x), y: round4(m.y) } : m;
  return new TextEncoder().encode(JSON.stringify(out));
}

export function decodeMessage(bytes: Uint8Array): RoomMessage | null {
  try {
    return validateMessage(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  } catch {
    return null;
  }
}
