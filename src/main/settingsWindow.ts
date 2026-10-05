import { app, BrowserWindow, nativeImage, nativeTheme, type BrowserWindowConstructorOptions } from 'electron';
import { SETTINGS_CH } from '../shared/settingsChannels';
import { assetPath, IS_MAC, loadPage, preloadPath } from './paths';

let win: BrowserWindow | null = null;
const goneListeners: Array<() => void> = [];

/**
 * Registers `cb` (once, for the app's lifetime) to run whenever the settings window closes or its renderer process
 * dies. The page can't tell the main process that it went away, so anything it left on (like key-capture suspend)
 * has to be released here.
 */
export function onSettingsWindowGone(cb: () => void): void {
  goneListeners.push(cb);
}

const notifyGone = (): void => {
  for (const cb of goneListeners) cb();
};

const captionColors = () => ({
  color: '#00000000',
  symbolColor: nativeTheme.shouldUseDarkColors ? '#ffffff' : '#1a1a1a',
  height: 40,
});

/** Windows 11: Mica with custom caption buttons. macOS: sidebar vibrancy with inset traffic lights. */
const chromeOptions = (): BrowserWindowConstructorOptions => (IS_MAC
  ? {
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 19 },
  }
  : {
    backgroundMaterial: 'mica',
    backgroundColor: '#00000000',
    titleBarStyle: 'hidden',
    titleBarOverlay: captionColors(),
  });

/** lolPing lives in the macOS menu bar: it only has a Dock icon (and ⌘-Tab entry) while settings are open. */
function showInDock(on: boolean): void {
  if (!IS_MAC) return;
  if (on) {
    void app.dock?.show();
    app.focus({ steal: true });
  } else {
    app.dock?.hide();
  }
}

export function settingsWindow(): BrowserWindow | null {
  return win && !win.isDestroyed() ? win : null;
}

/** `section`: the id of a settings section to scroll to, e.g. 'room'. */
export function openSettingsWindow(section?: string): BrowserWindow {
  const existing = settingsWindow();
  if (existing) {
    showInDock(true);
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    if (section) existing.webContents.send(SETTINGS_CH.showSection, section);
    return existing;
  }
  const w = new BrowserWindow({
    width: 980,
    height: 680,
    minWidth: 720,
    minHeight: 520,
    title: 'lolPing',
    icon: nativeImage.createFromPath(assetPath('textures', 'generic_ping.png')),
    show: false,
    ...chromeOptions(),
    webPreferences: { preload: preloadPath('settings'), spellcheck: false },
  });
  if (!IS_MAC) w.removeMenu(); // no menu bar, so pressing Alt in the window does nothing (macOS keeps the app menu)
  const onTheme = () => {
    if (!w.isDestroyed() && !IS_MAC) w.setTitleBarOverlay(captionColors());
  };
  nativeTheme.on('updated', onTheme);
  w.on('closed', () => {
    nativeTheme.off('updated', onTheme);
    win = null;
    showInDock(false);
    notifyGone();
  });
  w.webContents.on('render-process-gone', notifyGone); // the window can stay open on a dead page
  w.once('ready-to-show', () => {
    showInDock(true);
    w.show();
  });
  void loadPage(w, 'settings', section);
  win = w;
  return w;
}
