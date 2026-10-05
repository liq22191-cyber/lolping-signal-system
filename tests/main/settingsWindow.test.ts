import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { windows } = vi.hoisted(() => ({ windows: [] as unknown[] }));

vi.mock('electron', async () => {
  const { EventEmitter: Emitter } = await import('node:events');
  class FakeWindow extends Emitter {
    webContents = new Emitter();
    destroyed = false;
    constructor() {
      super();
      windows.push(this);
    }
    removeMenu(): void {}
    setTitleBarOverlay(): void {}
    isDestroyed(): boolean {
      return this.destroyed;
    }
    isMinimized(): boolean {
      return false;
    }
    restore(): void {}
    show(): void {}
    focus(): void {}
    close(): void {
      this.destroyed = true;
      this.emit('closed');
    }
  }
  const nativeTheme = Object.assign(new Emitter(), { shouldUseDarkColors: false });
  return { BrowserWindow: FakeWindow, nativeImage: { createFromPath: () => ({}) }, nativeTheme };
});

vi.mock('../../src/main/paths', () => ({
  IS_MAC: false,
  assetPath: () => 'icon.png',
  loadPage: () => Promise.resolve(),
  preloadPath: () => 'preload.js',
}));

type FakeWindow = EventEmitter & { webContents: EventEmitter; close(): void };
type Mod = typeof import('../../src/main/settingsWindow');
let mod: Mod;

beforeEach(async () => {
  windows.length = 0;
  vi.resetModules();
  mod = await import('../../src/main/settingsWindow');
});

describe('onSettingsWindowGone', () => {
  it('fires when the window closes', () => {
    const cb = vi.fn();
    mod.onSettingsWindowGone(cb);
    mod.openSettingsWindow();
    expect(cb).not.toHaveBeenCalled();
    (windows[0] as FakeWindow).close();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('fires when the renderer process dies while the window stays open', () => {
    const cb = vi.fn();
    mod.onSettingsWindowGone(cb);
    mod.openSettingsWindow();
    (windows[0] as FakeWindow).webContents.emit('render-process-gone', {}, { reason: 'crashed' });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('is registered once and covers every window opened later, without piling up listeners', () => {
    const cb = vi.fn();
    mod.onSettingsWindowGone(cb);
    mod.openSettingsWindow();
    (windows[0] as FakeWindow).close();
    mod.openSettingsWindow();
    expect(windows).toHaveLength(2);
    (windows[1] as FakeWindow).close();
    expect(cb).toHaveBeenCalledTimes(2);
    for (const w of windows as FakeWindow[]) expect(w.listenerCount('closed')).toBeLessThanOrEqual(1);
  });
});
