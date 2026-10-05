import { describe, expect, it } from 'vitest';
import { deriveRoomKeys, MAX_PACKET, open, seal } from '../../src/main/roomCrypto';

describe('deriveRoomKeys', () => {
  // Computed once with plain node:crypto (scrypt N=2^15 r=8 p=1, then HKDF-SHA256). Every OS must derive the same keys.
  it('matches the known-answer vectors', async () => {
    const k = await deriveRoomKeys('0000000000');
    expect(k.msgKey.toString('hex')).toBe('2b8ef59047332409e1662fe75774f9383fcd16b655fcb3db975f0e80ad2043da');
    expect(k.sigRoomId).toBe('0381782f350540d4639958bed594ae3b2b1a3d11683146e542edb34db89b6910');
    expect(k.sigPassword).toBe('dbc5ba2fcbcb257696a7d5f883ec1af4debabf392e8a1cc56ae2e02eaca4c7c1');
  });

  it('gives different codes different keys', async () => {
    const [a, b] = await Promise.all([deriveRoomKeys('0000000000'), deriveRoomKeys('0000000011')]);
    expect(a.msgKey.equals(b.msgKey)).toBe(false);
  });
});

describe('seal / open', () => {
  const key = Buffer.alloc(32, 7);
  const msg = new TextEncoder().encode('{"t":"bye"}');

  it('round-trips', () => {
    expect(open(key, seal(key, msg))).toEqual(Buffer.from(msg));
  });

  it('uses a fresh nonce every time', () => {
    expect(seal(key, msg).equals(seal(key, msg))).toBe(false);
  });

  it('rejects any flipped byte', () => {
    const packet = seal(key, msg);
    for (let i = 0; i < packet.length; i++) {
      const bad = Buffer.from(packet);
      bad[i] ^= 1;
      expect(open(key, bad)).toBeNull();
    }
  });

  it('rejects a wrong key, a truncated packet and an oversize packet', () => {
    const packet = seal(key, msg);
    expect(open(Buffer.alloc(32, 8), packet)).toBeNull();
    expect(open(key, packet.subarray(0, 20))).toBeNull();
    expect(open(key, new Uint8Array(0))).toBeNull();
    expect(open(key, Buffer.concat([packet, Buffer.alloc(MAX_PACKET)]))).toBeNull();
  });

  it('refuses to seal more than fits in a packet', () => {
    expect(() => seal(key, new Uint8Array(MAX_PACKET))).toThrow();
  });
});
