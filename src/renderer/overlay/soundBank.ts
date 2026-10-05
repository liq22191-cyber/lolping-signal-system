import { soundUrl } from '../../shared/pings';

/** Safety ceiling: more overlapping sounds than this are skipped (the ping still shows). */
export const MAX_VOICES = 8;

/** Pre-decoded Web Audio buffers: HTMLAudioElement per play added audible latency in the prototype. */
export class SoundBank {
  private readonly ctx = new AudioContext({ latencyHint: 'interactive' });
  private readonly buffers = new Map<string, AudioBuffer>();
  private voices = 0;

  /** Decodes every sound up front. Resolves with the files that failed to load. */
  async load(names: readonly string[]): Promise<string[]> {
    const results = await Promise.all(
      names.map(async (name) => {
        try {
          const res = await fetch(soundUrl(name));
          if (!res.ok) throw new Error(String(res.status));
          this.buffers.set(name, await this.ctx.decodeAudioData(await res.arrayBuffer()));
          return null;
        } catch {
          return `sounds/${name}.wav`;
        }
      }),
    );
    return results.filter((r): r is string => r !== null);
  }

  play(name: string, volume01: number): void {
    const buffer = this.buffers.get(name);
    if (!buffer || volume01 <= 0 || this.voices >= MAX_VOICES) return;
    if (this.ctx.state !== 'running') void this.ctx.resume();
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    src.buffer = buffer;
    gain.gain.value = volume01;
    src.connect(gain).connect(this.ctx.destination);
    this.voices++;
    src.onended = () => this.voices--;
    src.start();
  }
}
