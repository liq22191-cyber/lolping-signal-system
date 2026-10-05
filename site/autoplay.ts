import { WHEEL } from '../src/shared/geometry';
import type { Point } from '../src/shared/ipc';
import { wheelScale } from './input';
import { emit } from './overlayShim';
import { setHushed } from './sound';

// A scripted cursor that uses the wheel by itself: once when the stage first scrolls into view, and for the
// README capture (tools/capture-media). Any real input stops it.

interface Stroke {
  /** Where to press, as fractions of the stage. */
  at: Point;
  /** Drag path in wheel pixels from the press point. The last point picks the ping. */
  path: Point[];
}

/** The demo page's own run, when the stage scrolls into view. */
export const DEMO_STROKES: Stroke[] = [
  { at: { x: 0.27, y: 0.42 }, path: [{ x: 60, y: -90 }, { x: 150, y: -25 }, { x: 160, y: 0 }] }, // Push, then On My Way
  { at: { x: 0.73, y: 0.47 }, path: [{ x: -10, y: 120 }, { x: 115, y: 115 }] }, // Assist Me, then All In
  { at: { x: 0.5, y: 0.66 }, path: [{ x: -95, y: -110 }, { x: 0, y: -150 }] }, // Enemy Vision, then Danger
];

/** The README GIF: Enemy Missing on a "not responding" dialog, three times. */
export const HUNG_STROKES: Stroke[] = [
  { at: { x: 0.23, y: 0.4 }, path: [{ x: -40, y: -100 }, { x: -150, y: -20 }, { x: -160, y: 0 }] }, // via Enemy Vision
  { at: { x: 0.44, y: 0.51 }, path: [{ x: -20, y: 110 }, { x: -110, y: 70 }, { x: -160, y: 5 }] }, // via Assist Me, Need Vision
  { at: { x: 0.34, y: 0.45 }, path: [{ x: -150, y: 10 }] },
];

class Aborted extends Error {}

const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

export class Autoplay {
  private token: { aborted: boolean } | null = null;
  private wheelOpen = false;

  constructor(private readonly stage: HTMLElement, private readonly cursor: HTMLElement) {
    const stop = () => this.stop();
    window.addEventListener('pointerdown', stop, true);
    window.addEventListener('keydown', stop, true);
  }

  get running(): boolean {
    return this.token !== null;
  }

  stop(): void {
    if (!this.token) return;
    this.token.aborted = true;
    this.token = null;
    if (this.wheelOpen) emit('wheel:cancel', null);
    this.wheelOpen = false;
    this.cursor.classList.remove('on', 'down');
    setHushed(false);
  }

  /** Plays the sequence once. Resolves when it finishes or is stopped. */
  async play(strokes: readonly Stroke[] = DEMO_STROKES): Promise<void> {
    this.stop();
    const token = { aborted: false };
    this.token = token;
    setHushed(true);
    try {
      await this.run(token, strokes);
    } catch (err) {
      if (!(err instanceof Aborted)) throw err;
    } finally {
      if (this.token === token) {
        this.token = null;
        this.cursor.classList.remove('on', 'down');
        setHushed(false);
      }
    }
  }

  private async run(token: { aborted: boolean }, strokes: readonly Stroke[]): Promise<void> {
    const scale = wheelScale();
    let cur = this.stagePoint({ x: 0.52, y: 0.93 });
    this.place(cur);
    this.cursor.classList.add('on');
    await this.wait(400, token);

    for (const stroke of strokes) {
      const at = this.pressPoint(stroke.at, scale);
      await this.glide(cur, at, 750, token);
      await this.wait(120, token);
      this.cursor.classList.add('down');
      emit('wheel:open', at);
      this.wheelOpen = true;
      let from: Point = { x: 0, y: 0 };
      for (const to of stroke.path) {
        const a = from;
        await this.tween(300, token, (t) => {
          const d = lerp(a, to, t);
          this.place({ x: at.x + d.x * scale, y: at.y + d.y * scale });
          emit('wheel:move', { x: at.x + d.x, y: at.y + d.y });
        });
        from = to;
      }
      await this.wait(380, token);
      this.cursor.classList.remove('down');
      emit('wheel:release', { x: at.x + from.x, y: at.y + from.y });
      this.wheelOpen = false;
      cur = { x: at.x + from.x * scale, y: at.y + from.y * scale };
      await this.wait(420, token);
    }
    await this.glide(cur, this.stagePoint({ x: 0.64, y: 0.9 }), 700, token);
    await this.wait(2200, token);
  }

  /** Page coordinates of a point given as fractions of the stage. */
  private stagePoint(f: Point): Point {
    const r = this.stage.getBoundingClientRect();
    return { x: r.left + window.scrollX + f.x * r.width, y: r.top + window.scrollY + f.y * r.height };
  }

  /** Like stagePoint, but far enough from the stage's sides for the ring to fit (narrow screens). */
  private pressPoint(f: Point, scale: number): Point {
    const r = this.stage.getBoundingClientRect();
    const margin = Math.min(WHEEL.outerR * scale + 12, r.width / 2);
    const x = Math.min(Math.max(f.x * r.width, margin), r.width - margin);
    return { x: r.left + window.scrollX + x, y: r.top + window.scrollY + f.y * r.height };
  }

  private place(p: Point): void {
    this.cursor.style.transform = `translate(${p.x}px, ${p.y}px)`;
  }

  private glide(from: Point, to: Point, ms: number, token: { aborted: boolean }): Promise<void> {
    return this.tween(ms, token, (t) => this.place(lerp(from, to, t)));
  }

  private wait(ms: number, token: { aborted: boolean }): Promise<void> {
    return new Promise((resolve, reject) =>
      setTimeout(() => (token.aborted ? reject(new Aborted()) : resolve()), ms),
    );
  }

  private tween(ms: number, token: { aborted: boolean }, step: (t: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const t0 = performance.now();
      const frame = (now: number) => {
        if (token.aborted) return reject(new Aborted());
        const t = Math.min(1, (now - t0) / ms);
        step(ease(t));
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });
  }
}
