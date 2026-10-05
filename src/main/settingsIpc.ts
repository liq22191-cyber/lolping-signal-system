import { globalShortcut, ipcMain, shell } from 'electron';
import type { Strings } from '../shared/i18n';
import { SETTINGS_CH, type About, type AppStatus, type SetSettingsResult } from '../shared/ipc';
import { isEmoteId, type EmoteId } from '../shared/emotes';
import { hotkeyLabel, hotkeyToAccelerator, type Hotkey } from '../shared/keys';
import { pingById, type PingId } from '../shared/pings';
import type { Platform } from '../shared/platform';
import type { JoinResult, RoomState } from '../shared/room';
import type { Settings } from '../shared/settings';
import type { SettingsStore } from './settingsStore';

const PROJECT_URL = 'https://github.com/darrenprx/lolPing';

export interface SettingsIpcDeps {
  store: SettingsStore;
  getStatus(): AppStatus;
  setEnabled(on: boolean): void;
  preview(id: PingId): void;
  previewEmote(id: EmoteId): void;
  about(): About;
  retryHelper(): void;
  setCapturing(on: boolean): void;
  openAccessibility(): void;
  /** Strings in the app's current language. */
  text(): Strings;
  platform: Platform;
  room: {
    state(): RoomState;
    create(): Promise<void>;
    join(text: string): Promise<JoinResult>;
    leave(): void;
    mute(peer: string, on: boolean): void;
    clipboardCode(): Promise<string | null>;
    copyCode(): void;
  };
}

/** Returns an error message when another app already owns this shortcut. */
function hotkeyConflict(next: Hotkey, current: Hotkey, text: Strings, platform: Platform): string | null {
  if (next.mods === current.mods && next.vk === current.vk) return null;
  const accelerator = hotkeyToAccelerator(next);
  if (!accelerator) return null;
  try {
    const free = globalShortcut.register(accelerator, () => undefined);
    if (free) globalShortcut.unregister(accelerator);
    return free ? null : text.hotkeyTaken(hotkeyLabel(next, platform));
  } catch {
    return null;
  }
}

export function registerSettingsIpc(d: SettingsIpcDeps): void {
  ipcMain.handle(SETTINGS_CH.get, () => d.store.get());
  ipcMain.handle(SETTINGS_CH.set, (_e, patch: Partial<Settings>): SetSettingsResult => {
    if (patch.toggleHotkey) {
      const error = hotkeyConflict(patch.toggleHotkey, d.store.get().toggleHotkey, d.text(), d.platform);
      if (error) return { ok: false, error, settings: d.store.get() };
    }
    return { ok: true, settings: d.store.update(patch) };
  });
  ipcMain.handle(SETTINGS_CH.status, () => d.getStatus());
  ipcMain.handle(SETTINGS_CH.setEnabled, (_e, on: unknown) => d.setEnabled(on === true));
  ipcMain.handle(SETTINGS_CH.preview, (_e, id: unknown) => {
    const p = typeof id === 'string' ? pingById(id) : undefined;
    if (p) d.preview(p.id);
  });
  ipcMain.handle(SETTINGS_CH.previewEmote, (_e, id: unknown) => {
    if (isEmoteId(id)) d.previewEmote(id);
  });
  ipcMain.handle(SETTINGS_CH.about, () => d.about());
  ipcMain.handle(SETTINGS_CH.openFolder, async () => {
    await shell.openPath(d.store.dir);
  });
  ipcMain.handle(SETTINGS_CH.openProject, async () => {
    await shell.openExternal(PROJECT_URL);
  });
  ipcMain.handle(SETTINGS_CH.retryHelper, () => d.retryHelper());
  ipcMain.handle(SETTINGS_CH.capture, (_e, on: unknown) => d.setCapturing(on === true));
  ipcMain.handle(SETTINGS_CH.openAccessibility, () => d.openAccessibility());
  ipcMain.handle(SETTINGS_CH.roomGet, () => d.room.state());
  ipcMain.handle(SETTINGS_CH.roomCreate, () => d.room.create());
  ipcMain.handle(SETTINGS_CH.roomJoin, (_e, text: unknown): Promise<JoinResult> | JoinResult =>
    typeof text === 'string' ? d.room.join(text) : { ok: false, error: 'invalid' });
  ipcMain.handle(SETTINGS_CH.roomLeave, () => d.room.leave());
  ipcMain.handle(SETTINGS_CH.roomMute, (_e, peer: unknown, on: unknown) => {
    if (typeof peer === 'string') d.room.mute(peer, on === true);
  });
  ipcMain.handle(SETTINGS_CH.roomClipboard, () => d.room.clipboardCode());
  ipcMain.handle(SETTINGS_CH.roomCopy, () => d.room.copyCode());
}
