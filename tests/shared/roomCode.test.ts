import { describe, expect, it } from 'vitest';
import { checkChar, formatRoomCode, makeRoomCode, parseRoomCode, ROOM_ALPHABET } from '../../src/shared/roomCode';

const bytes = (...n: number[]): Uint8Array => Uint8Array.from(n);
const sample = makeRoomCode(bytes(7, 20, 4, 19, 3, 2, 17, 29, 26)); // 9 alphabet indexes

describe('makeRoomCode', () => {
  it('is 9 alphabet characters plus their check character', () => {
    expect(sample).toHaveLength(10);
    for (const c of sample) expect(ROOM_ALPHABET).toContain(c);
    expect(sample[9]).toBe(checkChar(sample.slice(0, 9)));
  });

  it('uses the low 5 bits of each byte', () => {
    expect(makeRoomCode(bytes(32, 33, 255, 0, 0, 0, 0, 0, 0)).slice(0, 3)).toBe('01Z');
  });
});

describe('formatRoomCode / parseRoomCode', () => {
  it('formats as PING-XXXXX-XXXXX', () => {
    expect(formatRoomCode(sample)).toMatch(/^PING-[0-9A-Z]{5}-[0-9A-Z]{5}$/);
  });

  it('round-trips', () => {
    expect(parseRoomCode(formatRoomCode(sample))).toEqual({ ok: true, code: sample });
  });

  it('forgives case, spaces, dashes and look-alike letters', () => {
    const shown = formatRoomCode('01ABCDEFG' + checkChar('01ABCDEFG'));
    const canonical = '01ABCDEFG' + checkChar('01ABCDEFG');
    expect(parseRoomCode(shown.toLowerCase())).toEqual({ ok: true, code: canonical });
    expect(parseRoomCode(shown.replace('-0', ' O').replace('1', 'I'))).toEqual({ ok: true, code: canonical });
    expect(parseRoomCode(shown.replace('1', 'l'))).toEqual({ ok: true, code: canonical });
    expect(parseRoomCode(canonical.split('').join(' '))).toEqual({ ok: true, code: canonical });
  });

  it('catches every single-character typo', () => {
    for (let i = 0; i < 10; i++) {
      for (const c of ROOM_ALPHABET) {
        if (c === sample[i]) continue;
        const typo = sample.slice(0, i) + c + sample.slice(i + 1);
        expect(parseRoomCode(typo)).toEqual({ ok: false, error: 'mistyped' });
      }
    }
  });

  it('finds the code inside a pasted chat message', () => {
    expect(parseRoomCode(`join me: ${formatRoomCode(sample)} thx!`)).toEqual({ ok: true, code: sample });
  });

  it('uses the first valid code when there are two', () => {
    const other = makeRoomCode(bytes(1, 2, 3, 4, 5, 6, 7, 8, 9));
    expect(parseRoomCode(`${formatRoomCode(other)} or ${formatRoomCode(sample)}`)).toEqual({ ok: true, code: other });
  });

  it('skips a mistyped code when a valid one follows', () => {
    const typo = sample.slice(0, 9) + (sample[9] === '0' ? '1' : '0');
    expect(parseRoomCode(`${formatRoomCode(typo)} sorry: ${formatRoomCode(sample)}`)).toEqual({ ok: true, code: sample });
  });

  it('rejects text without a code', () => {
    expect(parseRoomCode('')).toEqual({ ok: false, error: 'invalid' });
    expect(parseRoomCode('hello there')).toEqual({ ok: false, error: 'invalid' });
    expect(parseRoomCode('PING-123')).toEqual({ ok: false, error: 'invalid' });
  });

  it('never mistakes words in front of a real code for a code', () => {
    // Words whose letters are all code characters (after O→0, I/L→1), the kind that produced false matches.
    const words = ['team', 'please', 'join', 'me', 'hey', 'the', 'room', 'here', 'is', 'my', 'code', 'for', 'tonight',
      'play', 'with', 'us', 'ranked', 'now', 'hello', 'there', 'friends', 'quick', 'match', 'meet', 'at', 'eight', 'ok'];
    let seed = 7;
    const rand = (n: number): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
      return seed % n;
    };
    for (let i = 0; i < 3000; i++) {
      const code = makeRoomCode(Uint8Array.from({ length: 9 }, () => rand(256)));
      const prefix = Array.from({ length: 4 + rand(12) }, () => words[rand(words.length)]).join(' ');
      expect(parseRoomCode(`${prefix}: ${formatRoomCode(code)}`)).toEqual({ ok: true, code });
    }
  });

  it('finds nothing in prose without a code', () => {
    const prose = 'Team, please join the ranked match tonight at eight. Bring snacks and remember the headset. '
      + 'Hello there friends, the room is ready whenever you are, see you in the lobby soon';
    const words = prose.split(' ');
    for (let n = 1; n <= words.length; n++) {
      for (let start = 0; start + n <= words.length; start += 3) {
        const text = words.slice(start, start + n).join(' ');
        expect(parseRoomCode(text).ok, text).toBe(false);
      }
    }
  });

  it('reads the example that used to give TEAMP1EASE', () => {
    const code = makeRoomCode(Uint8Array.from([22, 2, 27, 12, 22, 1, 3, 27, 20]));
    expect(parseRoomCode(`Team, please join: ${formatRoomCode(code)}`)).toEqual({ ok: true, code });
  });

  it('never joins a word to a bare spaced code that follows it', () => {
    const code = makeRoomCode(Uint8Array.from([7, 20, 4, 19, 3, 2, 17, 29, 26]));
    for (const word of ['hello', 'there', 'match', 'teams']) {
      const r = parseRoomCode(`${word} ${code.slice(0, 5)} ${code.slice(5)}`);
      expect(r.ok ? r.code : null, word).not.toBe(word.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1') + code.slice(0, 5));
      if (r.ok) expect(r.code).toBe(code);
    }
  });

  it('accepts a code typed with spaces when it is the whole input', () => {
    expect(parseRoomCode(`${sample.slice(0, 5)} ${sample.slice(5)}`)).toEqual({ ok: true, code: sample });
  });

  describe('strict (clipboard) mode', () => {
    it('accepts a PING- code anywhere in the text', () => {
      expect(parseRoomCode(`join: ${formatRoomCode(sample)}`, { strict: true })).toEqual({ ok: true, code: sample });
    });

    it('accepts a clipboard that holds only a bare code', () => {
      expect(parseRoomCode(` ${sample.slice(0, 5)}-${sample.slice(5)}
`, { strict: true })).toEqual({ ok: true, code: sample });
    });

    it('ignores bare codes and code-shaped words inside other text', () => {
      expect(parseRoomCode(`id ${sample} copied`, { strict: true }).ok).toBe(false);
      expect(parseRoomCode('STRAWBERRY and PREFERENCE, see you at 8', { strict: true }).ok).toBe(false);
    });

    it('ignores a lone code-shaped word without digits (HAPPYCHAIR passes the check character)', () => {
      expect(parseRoomCode('HAPPYCHAIR')).toEqual({ ok: true, code: 'HAPPYCHA1R' }); // typed on purpose: allowed
      expect(parseRoomCode('HAPPYCHAIR', { strict: true }).ok).toBe(false);
      expect(parseRoomCode('happy chair').ok).toBe(false);
    });
  });
});

