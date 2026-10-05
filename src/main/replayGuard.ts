const WINDOW = 64;
/** Wide enough for machines whose clocks aren't synced; old enough captures can't be replayed later. */
const MAX_SKEW_MS = 10 * 60 * 1000;

export type ReplayVerdict = 'ok' | 'stale' | 'replay' | 'gone';

/** Rejects packets seen before (per-peer sequence window), too old or new to trust, or from a peer that left. */
export class ReplayGuard {
  private readonly peers = new Map<string, { max: number; bits: bigint }>();
  private readonly gone = new Set<string>();

  constructor(private readonly now: () => number) {}

  accept(peer: string, seq: number, ts: number): ReplayVerdict {
    if (this.gone.has(peer)) return 'gone';
    if (Math.abs(ts - this.now()) > MAX_SKEW_MS) return 'stale';
    const p = this.peers.get(peer);
    if (!p) {
      this.peers.set(peer, { max: seq, bits: 1n });
      return 'ok';
    }
    if (seq > p.max) {
      const shift = seq - p.max;
      p.bits = shift >= WINDOW ? 1n : ((p.bits << BigInt(shift)) | 1n) & ((1n << BigInt(WINDOW)) - 1n);
      p.max = seq;
      return 'ok';
    }
    const back = p.max - seq;
    if (back >= WINDOW) return 'replay';
    const bit = 1n << BigInt(back);
    if (p.bits & bit) return 'replay';
    p.bits |= bit;
    return 'ok';
  }

  markGone(peer: string): void {
    this.gone.add(peer);
    this.peers.delete(peer);
  }
}
