import { describe, expect, it } from 'vitest';
import { numberDisplays, resolveTarget, toShared } from '../../src/main/displayNumbers';

const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe('numberDisplays', () => {
  it('makes the primary #1 even when it is not leftmost, then sorts by x then y', () => {
    const list = numberDisplays([
      { id: 10, bounds: rect(0, 0, 1920, 1080) },
      { id: 20, bounds: rect(1920, 0, 2560, 1440) },
      { id: 30, bounds: rect(-1920, 0, 1920, 1080) },
      { id: 40, bounds: rect(0, -1080, 1920, 1080) },
    ], 20);
    expect(list.map((d) => [d.number, d.id, d.primary])).toEqual([
      [1, 20, true], [2, 30, false], [3, 40, false], [4, 10, false],
    ]);
  });
});

describe('toShared / resolveTarget', () => {
  const list = numberDisplays([{ id: 1, bounds: rect(0, 0, 2560, 1440) }, { id: 2, bounds: rect(2560, 0, 1920, 1080) }], 1);

  it('turns overlay pixels into a fraction of the display', () => {
    expect(toShared(list, 2, 960, 270)).toEqual({ d: 2, x: 0.5, y: 0.25 });
  });

  it('clamps points on or past the edge', () => {
    expect(toShared(list, 1, 2560, 1440)).toEqual({ d: 1, x: 1, y: 1 });
    expect(toShared(list, 1, -5, 2000)).toEqual({ d: 1, x: 0, y: 1 });
  });

  it('returns null for an unknown display', () => {
    expect(toShared(list, 99, 1, 1)).toBeNull();
  });

  it('finds the display by number and falls back to #1', () => {
    expect(resolveTarget(list, 2)?.id).toBe(2);
    expect(resolveTarget(list, 3)?.id).toBe(1);
    expect(resolveTarget([], 1)).toBeNull();
  });
});
