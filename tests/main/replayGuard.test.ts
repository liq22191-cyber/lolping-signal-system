import { describe, expect, it } from 'vitest';
import { ReplayGuard } from '../../src/main/replayGuard';

const NOW = 1_780_000_000_000;
const guard = () => new ReplayGuard(() => NOW);

describe('ReplayGuard', () => {
  it('accepts increasing sequence numbers and rejects repeats', () => {
    const g = guard();
    expect(g.accept('a', 1, NOW)).toBe('ok');
    expect(g.accept('a', 2, NOW)).toBe('ok');
    expect(g.accept('a', 2, NOW)).toBe('replay');
  });

  it('accepts late packets inside the 64 window once', () => {
    const g = guard();
    g.accept('a', 100, NOW);
    expect(g.accept('a', 90, NOW)).toBe('ok');
    expect(g.accept('a', 90, NOW)).toBe('replay');
    expect(g.accept('a', 36, NOW)).toBe('replay'); // 64 behind
    expect(g.accept('a', 70, NOW)).toBe('ok');
  });

  it('forgets the window after a big jump', () => {
    const g = guard();
    g.accept('a', 5, NOW);
    expect(g.accept('a', 500, NOW)).toBe('ok');
    expect(g.accept('a', 5, NOW)).toBe('replay');
  });

  it('keeps peers apart', () => {
    const g = guard();
    g.accept('a', 1, NOW);
    expect(g.accept('b', 1, NOW)).toBe('ok');
  });

  it('rejects timestamps more than 10 minutes off', () => {
    const g = guard();
    expect(g.accept('a', 1, NOW + 600_000)).toBe('ok');
    expect(g.accept('a', 2, NOW + 600_001)).toBe('stale');
    expect(g.accept('a', 3, NOW - 600_001)).toBe('stale');
  });

  it('a stale packet does not use up its sequence number', () => {
    const g = guard();
    expect(g.accept('a', 1, NOW + 900_000)).toBe('stale');
    expect(g.accept('a', 1, NOW)).toBe('ok');
  });

  it('rejects everything from a peer that said bye', () => {
    const g = guard();
    g.accept('a', 1, NOW);
    g.markGone('a');
    expect(g.accept('a', 2, NOW)).toBe('gone');
  });
});
