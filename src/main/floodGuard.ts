import { RateLimiter } from './rateLimiter';

export interface FloodLimits {
  /** Packets per second from one source address. */
  perIp: number;
  /** Packets per second from all sources together: source addresses are easy to spoof on a LAN. */
  total: number;
  /** Most source addresses remembered; past this the per-address budgets start over, so memory stays bounded. */
  maxTracked: number;
}

export const DEFAULT_FLOOD_LIMITS: FloodLimits = { perIp: 100, total: 800, maxTracked: 1024 };

/** Decides, before any decryption is tried, whether a received packet is worth looking at. */
export class FloodGuard {
  private readonly perIp: RateLimiter;
  private readonly total: RateLimiter;

  constructor(now: () => number, private readonly limits: FloodLimits = DEFAULT_FLOOD_LIMITS) {
    this.perIp = new RateLimiter(now);
    this.total = new RateLimiter(now);
  }

  allow(ip: string): boolean {
    if (this.perIp.size >= this.limits.maxTracked) this.perIp.clear();
    // Per address first, so one noisy source doesn't use up everyone else's share.
    return this.perIp.allow(ip, this.limits.perIp) && this.total.allow('*', this.limits.total);
  }

  get tracked(): number {
    return this.perIp.size;
  }
}
