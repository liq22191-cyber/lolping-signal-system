import { describe, expect, it } from 'vitest';
import { physicalToDip, physicalToLocal, type DisplayMap } from '../../src/main/coords';

// Ultrawide primary at 100% + a 1080p monitor at 150% to its right + a 1440p monitor at 125% to its left.
const A: DisplayMap = { id: 1, scale: 1, dip: { x: 0, y: 0, width: 3440, height: 1440 }, phys: { x: 0, y: 0, width: 3440, height: 1440 } };
const B: DisplayMap = { id: 2, scale: 1.5, dip: { x: 3440, y: 0, width: 1280, height: 720 }, phys: { x: 3440, y: 0, width: 1920, height: 1080 } };
const C: DisplayMap = { id: 3, scale: 1.25, dip: { x: -2048, y: 0, width: 2048, height: 1152 }, phys: { x: -2560, y: 0, width: 2560, height: 1440 } };
const maps = [A, B, C];

describe('coords', () => {
  it('maps a point on the primary display unchanged', () => {
    expect(physicalToLocal(1000, 500, maps)).toEqual({ displayId: 1, x: 1000, y: 500 });
  });

  it('scales points on a high-DPI display', () => {
    expect(physicalToLocal(3440 + 300, 150, maps)).toEqual({ displayId: 2, x: 200, y: 100 });
    expect(physicalToDip(3440 + 300, 150, maps)).toMatchObject({ x: 3640, y: 100 });
  });

  it('handles displays with negative origins', () => {
    expect(physicalToLocal(-1280, 720, maps)).toEqual({ displayId: 3, x: 1024, y: 576 });
  });

  it('physicalToLocal maps onto the wheel display across monitors', () => {
    // Wheel opened on A, cursor now on B: coordinates stay relative to A's overlay.
    expect(physicalToLocal(3440 + 300, 150, maps, 1)).toEqual({ displayId: 1, x: 3640, y: 100 });
  });

  it('uses the nearest display for points outside every display', () => {
    expect(physicalToLocal(1000, 2000, maps)).toEqual({ displayId: 1, x: 1000, y: 2000 });
  });

  it('returns null with no displays or an unknown target', () => {
    expect(physicalToLocal(0, 0, [])).toBeNull();
    expect(physicalToLocal(0, 0, maps, 99)).toBeNull();
  });
});
