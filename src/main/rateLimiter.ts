/** Token bucket per key: `perSecond` tokens, refilled continuously. Excess calls are refused, never queued. */
export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();

  constructor(private readonly now: () => number) {}

  /** `perSecond` 0 means unlimited. */
  allow(key: string, perSecond: number): boolean {
    if (perSecond <= 0) return true;
    const now = this.now();
    const b = this.buckets.get(key) ?? { tokens: perSecond, at: now };
    b.tokens = Math.min(perSecond, b.tokens + ((now - b.at) / 1000) * perSecond);
    b.at = now;
    this.buckets.set(key, b);
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  forget(key: string): void {
    this.buckets.delete(key);
  }

  /** How many keys have a bucket. */
  get size(): number {
    return this.buckets.size;
  }

  clear(): void {
    this.buckets.clear();
  }
}
