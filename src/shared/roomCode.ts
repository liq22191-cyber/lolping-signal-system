/** Crockford base32: no I, L, O or U, so a code read out loud can't be misheard as another. */
export const ROOM_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const CODE_LENGTH = 10;
const PREFIX = 'P1NG'; // "PING" after I→1
/** Pasted chat messages are scanned for a code; anything longer is cut first. */
const MAX_INPUT = 2000;

export type ParsedRoomCode = { ok: true; code: string } | { ok: false; error: 'invalid' | 'mistyped' };

/** Luhn mod 32 over the 9 random characters: catches every single-character error and most swaps. */
export function checkChar(nine: string): string {
  let factor = 2;
  let sum = 0;
  for (let i = nine.length - 1; i >= 0; i--) {
    let addend = factor * ROOM_ALPHABET.indexOf(nine[i]);
    factor = factor === 2 ? 1 : 2;
    addend = Math.floor(addend / 32) + (addend % 32);
    sum += addend;
  }
  return ROOM_ALPHABET[(32 - (sum % 32)) % 32];
}

/** The canonical code (10 characters, no prefix) from 9 random bytes. */
export function makeRoomCode(random9: Uint8Array): string {
  let nine = '';
  for (let i = 0; i < 9; i++) nine += ROOM_ALPHABET[random9[i] & 31];
  return nine + checkChar(nine);
}

export const formatRoomCode = (canonical: string): string => `PING-${canonical.slice(0, 5)}-${canonical.slice(5)}`;

const valid = (code: string): boolean => checkChar(code.slice(0, 9)) === code[9];
const isCodeShaped = (c: string): boolean => c.length === CODE_LENGTH && [...c].every((ch) => ROOM_ALPHABET.includes(ch));
/** Look-alike letters read as the digits they resemble: O→0, I/L→1. */
const mapLookalikes = (t: string): string => t.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1');

interface Token {
  /** After look-alike mapping, dashes removed. */
  text: string;
  /** Typed with at least one real digit: ordinary words never are, real codes almost always are. */
  digit: boolean;
}

/**
 * Finds a room code in what the user typed or pasted. Most trusted first:
 * 1. A PING code anywhere, split only where the display form splits it (PING-XXXXX-XXXXX, PING XXXXX XXXXX, …).
 * 2. A lone 10-character token. Inside longer text it must contain a real digit, so words like STRAWBERRY don't count.
 * 3. The whole input being one code, however it is spaced. With spaces it needs a real digit too ("hello there").
 * `strict` (the clipboard, read without the user typing anything) accepts only 1, or a clipboard that is just a code.
 * Neighbouring words are never glued onto a code: that made ordinary chat read as codes.
 */
export function parseRoomCode(text: string, opts: { strict?: boolean } = {}): ParsedRoomCode {
  const tokens: Token[] = text.slice(0, MAX_INPUT).split(/[^0-9A-Za-z-]+/)
    .map((raw) => raw.replace(/-/g, ''))
    .filter((raw) => raw.length > 0)
    .map((raw) => ({ text: mapLookalikes(raw), digit: /[0-9]/.test(raw) }));
  let mistyped = false;
  const tryCode = (c: string, countsAsTypo: boolean): string | null => {
    if (!isCodeShaped(c)) return null;
    if (valid(c)) return c;
    if (countsAsTypo) mistyped = true;
    return null;
  };

  // 1. PING codes: the token boundaries must fall where the display form's do (after PING, and after 5 more).
  for (let i = 0; i < tokens.length; i++) {
    if (!tokens[i].text.startsWith(PREFIX)) continue;
    let joined = '';
    for (let j = i; j < tokens.length; j++) {
      joined += tokens[j].text;
      if (![PREFIX.length, PREFIX.length + 5, PREFIX.length + CODE_LENGTH].includes(joined.length)) break;
      if (joined.length === PREFIX.length + CODE_LENGTH) {
        const code = tryCode(joined.slice(PREFIX.length), true);
        if (code) return { ok: true, code };
        break;
      }
    }
  }

  // The whole input as one code (also the strict mode's "clipboard is just a code"). Spaced, or read from the
  // clipboard, it needs a real digit: typing it is deliberate, a clipboard word that happens to pass isn't.
  const whole = tokens.map((t) => t.text).join('');
  const wholeDigit = tokens.some((t) => t.digit);
  if (opts.strict ? tokens.length === 1 && wholeDigit : tokens.length === 1 || wholeDigit) {
    const code = tryCode(whole.startsWith(PREFIX) && whole.length === PREFIX.length + CODE_LENGTH ? whole.slice(PREFIX.length) : whole, true);
    if (code) return { ok: true, code };
  }
  if (!opts.strict) {
    // 2. A lone token inside longer text.
    for (const t of tokens) {
      if (!t.digit) continue;
      const code = tryCode(t.text, false);
      if (code) return { ok: true, code };
    }
  }
  return { ok: false, error: mistyped ? 'mistyped' : 'invalid' };
}
