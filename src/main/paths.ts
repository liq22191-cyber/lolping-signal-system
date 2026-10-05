import { app, type BrowserWindow } from 'electron';
import { join } from 'node:path';
import { platformOf, type Platform } from '../shared/platform';
import { APP_SCHEME } from './appProtocol';

export type Page = 'overlay' | 'settings';

export const PLATFORM: Platform = platformOf(process.platform);
export const IS_MAC = PLATFORM === 'mac';

const HELPER_FILE = IS_MAC ? 'hook-helper' : 'hook-helper.exe';

export const helperExePath = (): string =>
  app.isPackaged
    ? join(process.resourcesPath, HELPER_FILE)
    : join(app.getAppPath(), 'native', 'hook-helper', 'build', HELPER_FILE);

/** Files from build/ that ship as extraResources (the macOS menu bar icon). */
export const buildResourcePath = (file: string): string =>
  app.isPackaged ? join(process.resourcesPath, file) : join(app.getAppPath(), 'build', file);

export const preloadPath = (name: Page): string => join(__dirname, '../preload', `${name}.js`);

/** Files from assets/ (in production they are copied into out/renderer by Vite's publicDir). */
export const assetPath = (...parts: string[]): string =>
  app.isPackaged ? join(__dirname, '../renderer', ...parts) : join(app.getAppPath(), 'assets', ...parts);

export const settingsDir = (): string => join(app.getPath('appData'), 'lolPing');

/** `hash` (without #) is passed to the page, e.g. the settings section to open at. */
export function loadPage(win: BrowserWindow, page: Page, hash = ''): Promise<void> {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  const suffix = hash ? `#${hash}` : '';
  return devUrl ? win.loadURL(`${devUrl}/${page}/index.html${suffix}`) : win.loadURL(`${APP_SCHEME}://app/${page}/index.html${suffix}`);
}
