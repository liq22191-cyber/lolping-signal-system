import { describe, expect, it } from 'vitest';
import { FloodGuard } from '../../src/main/floodGuard';

function guard() {
  let now = 0;
  return { g: new FloodGuard(() => now, { perIp: 100, total: 800, maxTracked: 1024 }), advance: (ms: number) => (now += ms) };
}

describe('FloodGuard', () => {
  it('limits one address to its own budget', () => {
    const { g } = guard();
    let allowed = 0;
    for (let i = 0; i < 500; i++) if (g.allow('10.0.0.9')) allowed++;
    expect(allowed).toBe(100);
  });

  it('caps the total even when every packet claims a different (spoofed) source', () => {
    const { g } = guard();
    let allowed = 0;
    for (let i = 0; i < 5000; i++) if (g.allow(`10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`)) allowed++;
    expect(allowed).toBe(800);
  });

  it('never tracks more than maxTracked addresses', () => {
    const { g, advance } = guard();
    for (let i = 0; i < 20_000; i++) {
      g.allow(`ip${i}`);
      if (i % 500 === 0) advance(1000);
    }
    expect(g.tracked).toBeLessThanOrEqual(1024);
  });

  it('refills over time', () => {
    const { g, advance } = guard();
    for (let i = 0; i < 100; i++) g.allow('a');
    expect(g.allow('a')).toBe(false);
    advance(1000);
    expect(g.allow('a')).toBe(true);
  });
});
