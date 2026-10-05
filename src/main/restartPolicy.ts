/** Decides how long to wait before restarting a crashed hook helper, and when to give up. */
export class RestartPolicy {
  private crashes: number[] = [];

  constructor(
    private readonly delaysMs: readonly number[] = [500, 1000, 2000],
    private readonly maxCrashes = 3,
    private readonly windowMs = 60_000,
  ) {}

  /** Record an unexpected exit. Returns the restart delay in ms, or 'giveUp'. */
  onExit(nowMs: number): number | 'giveUp' {
    this.crashes = this.crashes.filter((t) => nowMs - t < this.windowMs);
    this.crashes.push(nowMs);
    if (this.crashes.length >= this.maxCrashes) return 'giveUp';
    return this.delaysMs[Math.min(this.crashes.length - 1, this.delaysMs.length - 1)];
  }

  reset(): void {
    this.crashes = [];
  }
}
