import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../../src/main/rateLimiter';

function limiter() {
  let now = 0;
  return { rl: new RateLimiter(() => now), advance: (ms: number) => (now += ms) };
}

describe('RateLimiter', () => {
  it('allows a burst up to the limit, then refills over time', () => {
    const { rl, advance } = limiter();
    for (let i = 0; i < 5; i++) expect(rl.allow('a', 5)).toBe(true);
    expect(rl.allow('a', 5)).toBe(false);
    advance(200);
    expect(rl.allow('a', 5)).toBe(true);
    expect(rl.allow('a', 5)).toBe(false);
  });

  it('never stores more than one second of tokens', () => {
    const { rl, advance } = limiter();
    rl.allow('a', 2);
    advance(60_000);
    expect([rl.allow('a', 2), rl.allow('a', 2), rl.allow('a', 2)]).toEqual([true, true, false]);
  });

  it('treats 0 as unlimited', () => {
    const { rl } = limiter();
    for (let i = 0; i < 1000; i++) expect(rl.allow('a', 0)).toBe(true);
  });

  it('keeps keys apart, and forget resets one', () => {
    const { rl } = limiter();
    expect(rl.allow('a', 1)).toBe(true);
    expect(rl.allow('b', 1)).toBe(true);
    expect(rl.allow('a', 1)).toBe(false);
    rl.forget('a');
    expect(rl.allow('a', 1)).toBe(true);
  });
});
