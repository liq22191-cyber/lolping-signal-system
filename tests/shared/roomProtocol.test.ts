import { describe, expect, it } from 'vitest';
import { isTagColor, TAG_COLORS } from '../../src/shared/roomColors';
import {
  clampNameInput, decodeMessage, encodeMessage, sanitizeName, validateMessage, type PingMsg, type PresenceMsg, type RoomMessage,
} from '../../src/shared/roomProtocol';

const base = { peer: '0123456789abcdef', seq: 4, ts: 1_780_000_000_000 };
const presence: PresenceMsg = { ...base, t: 'presence', proto: 1, app: '0.3.0', name: 'Alex', color: 3, status: 'on' };
const ping: PingMsg = { ...base, t: 'ping', ping: 'danger', d: 2, x: 0.25, y: 1 };

describe('encode / decode', () => {
  it.each<RoomMessage>([presence, ping, { ...base, t: 'bye' }])('round-trips $t', (m) => {
    expect(decodeMessage(encodeMessage(m))).toEqual(m);
  });

  it('rounds x and y to 4 decimals', () => {
    expect(decodeMessage(encodeMessage({ ...ping, x: 0.123456, y: 0.987654 }))).toMatchObject({ x: 0.1235, y: 0.9877 });
  });

  it('rejects bytes that are not JSON', () => {
    expect(decodeMessage(new TextEncoder().encode('{nope'))).toBeNull();
  });
});

describe('validateMessage', () => {
  it.each([
    ['unknown type', { ...presence, t: 'hello' }],
    ['short peer', { ...presence, peer: 'abc' }],
    ['upper-case peer', { ...presence, peer: '0123456789ABCDEF' }],
    ['negative seq', { ...presence, seq: -1 }],
    ['fractional seq', { ...presence, seq: 1.5 }],
    ['unsafe seq', { ...presence, seq: 2 ** 60 }],
    ['NaN ts', { ...presence, ts: Number.NaN }],
    ['unknown ping', { ...ping, ping: 'hold' }],
    ['display 0', { ...ping, d: 0 }],
    ['display 17', { ...ping, d: 17 }],
    ['fractional display', { ...ping, d: 1.5 }],
    ['x below 0', { ...ping, x: -0.01 }],
    ['x above 1', { ...ping, x: 1.01 }],
    ['infinite y', { ...ping, y: Infinity }],
    ['string x', { ...ping, x: '0.5' }],
    ['colour 8', { ...presence, color: 8 }],
    ['colour -1', { ...presence, color: -1 }],
    ['colour as CSS', { ...presence, color: 'red' }],
    ['unknown status', { ...presence, status: 'away' }],
    ['huge app version', { ...presence, app: 'x'.repeat(65) }],
    ['name not a string', { ...presence, name: 42 }],
    ['fractional proto', { ...presence, proto: 1.5 }],
  ])('rejects %s', (_label, raw) => {
    expect(validateMessage(raw)).toBeNull();
  });

  it('rejects non-objects', () => {
    for (const raw of [null, undefined, 3, 'x', [], [presence]]) expect(validateMessage(raw)).toBeNull();
  });

  it('keeps known fields only', () => {
    expect(validateMessage({ ...ping, extra: 'ignored' })).toEqual(ping);
  });

  it('cannot pollute prototypes', () => {
    const raw = JSON.parse('{"t":"bye","peer":"0123456789abcdef","seq":1,"ts":1,"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":1}}}');
    expect(validateMessage(raw)).toEqual({ t: 'bye', peer: '0123456789abcdef', seq: 1, ts: 1 });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('accepts a presence from a newer protocol (the version check is the room’s job)', () => {
    expect(validateMessage({ ...presence, proto: 2 })).toEqual({ ...presence, proto: 2 });
  });

  it('sanitises the name', () => {
    expect(validateMessage({ ...presence, name: '‮Alex\u0000' })).toMatchObject({ name: 'Alex' });
  });
});

describe('sanitizeName', () => {
  it('strips control, bidi and zero-width characters', () => {
    expect(sanitizeName('\u0007A​l‪e⁦x\u007f\u0085﻿')).toBe('Alex');
  });

  it('strips line separators, Arabic letter mark, soft hyphen, Mongolian vowel separator, Hangul fillers and CGJ', () => {
    expect(sanitizeName('A l e؜x᠎­͏')).toBe('Alex');
    expect(sanitizeName('ᅟᅠㅤﾠ')).toBe('Player');
  });

    it('trims and cuts to 16 code points, counting an emoji as one', () => {
    expect(sanitizeName('  Bob  ')).toBe('Bob');
    expect(sanitizeName('🎮'.repeat(20))).toBe('🎮'.repeat(16));
    expect(sanitizeName('x'.repeat(40))).toHaveLength(16);
  });

  it('falls back when nothing is left', () => {
    expect(sanitizeName('   ')).toBe('Player');
    expect(sanitizeName('​', 'Darren')).toBe('Darren');
  });
});

describe('clampNameInput', () => {
  it('limits typing to 16 code points, so 16 emoji fit (a UTF-16 maxLength allowed only 8)', () => {
    expect(clampNameInput('🎮'.repeat(20))).toBe('🎮'.repeat(16));
    expect(clampNameInput('x'.repeat(20))).toHaveLength(16);
    expect(clampNameInput(' Bob ')).toBe(' Bob '); // no trimming while typing
  });
});

describe('tag colours', () => {
  it('has 8 distinct colours', () => {
    expect(TAG_COLORS).toHaveLength(8);
    expect(new Set(TAG_COLORS).size).toBe(8);
  });

  it('accepts palette indexes only', () => {
    expect(isTagColor(0)).toBe(true);
    expect(isTagColor(7)).toBe(true);
    for (const v of [8, -1, 1.5, '1', null]) expect(isTagColor(v)).toBe(false);
  });
});
