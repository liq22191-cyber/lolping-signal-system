import { describe, expect, it } from 'vitest';
import { RestartPolicy } from '../../src/main/restartPolicy';

describe('RestartPolicy', () => {
  it('backs off and gives up on the third crash within a minute', () => {
    const p = new RestartPolicy();
    expect(p.onExit(0)).toBe(500);
    expect(p.onExit(1_000)).toBe(1000);
    expect(p.onExit(2_000)).toBe('giveUp');
  });

  it('forgets crashes older than the window', () => {
    const p = new RestartPolicy();
    expect(p.onExit(0)).toBe(500);
    expect(p.onExit(30_000)).toBe(1000);
    expect(p.onExit(60_001)).toBe(1000); // the crash at 0 has expired; the one at 30_000 has not
  });

  it('starts over after reset', () => {
    const p = new RestartPolicy([10, 20], 2);
    expect(p.onExit(0)).toBe(10);
    expect(p.onExit(1)).toBe('giveUp');
    p.reset();
    expect(p.onExit(2)).toBe(10);
  });
});
