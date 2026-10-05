import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALL_PINGS, DEFAULT_WHEEL, DEFAULT_WHEEL_PINGS, allSoundNames, allTextureNames, pingById, soundUrl, textureUrl,
} from '../../src/shared/pings';

const assets = resolve(__dirname, '../../assets');

describe('ping table', () => {
  it('lays out the default wheel top then clockwise', () => {
    expect(DEFAULT_WHEEL).toEqual(['danger', 'push', 'omw', 'allin', 'assist', 'needvision', 'missing', 'enemyvision']);
    expect(DEFAULT_WHEEL_PINGS.map((p) => p.id)).toEqual(DEFAULT_WHEEL);
  });

  it('offers the generic, Bait and Vision Cleared pings beyond the default wheel', () => {
    expect(ALL_PINGS.map((p) => p.id)).toEqual([...DEFAULT_WHEEL, 'generic', 'bait', 'visioncleared']);
  });

  it('uses the in-game sounds for Bait and Vision Cleared', () => {
    expect(pingById('bait')?.sound).toBe('SRP_11');
    expect(pingById('visioncleared')?.sound).toBe('SRP_6');
  });

  it('draws Bait with the same render on the wheel and on screen', () => {
    expect(pingById('bait')).toMatchObject({ icon: 'pingwheel_baitrender', art: ['pingwheel_baitrender'] });
  });

  it('has unique ids', () => {
    expect(new Set(ALL_PINGS.map((p) => p.id)).size).toBe(ALL_PINGS.length);
  });

  it('references only textures that exist', () => {
    for (const name of allTextureNames()) {
      expect(existsSync(resolve(assets, 'textures', `${name}.png`)), name).toBe(true);
    }
  });

  it('references only sounds that exist', () => {
    for (const name of allSoundNames()) {
      expect(existsSync(resolve(assets, 'sounds', `${name}.wav`)), name).toBe(true);
    }
  });

  it('never uses colourblind textures', () => {
    for (const name of allTextureNames()) expect(name).not.toMatch(/_cb/);
  });

  it('gives All In two clashing halves and every other ping one art image', () => {
    for (const p of ALL_PINGS) expect(p.art.length).toBe(p.id === 'allin' ? 2 : 1);
  });

  it('looks pings up by id', () => {
    expect(pingById('omw')?.sound).toBe('OnMyWay');
    expect(pingById('nope')).toBeUndefined();
  });

  it('builds page-relative asset URLs', () => {
    expect(textureUrl('omw')).toBe('../textures/omw.png');
    expect(soundUrl('MIA')).toBe('../sounds/MIA.wav');
  });
});
