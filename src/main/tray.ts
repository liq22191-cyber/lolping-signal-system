import { Menu, Tray, nativeImage, type MenuItemConstructorOptions, type NativeImage } from 'electron';
import { strings, type Strings } from '../shared/i18n';

export type TrayMode = 'on' | 'off' | 'failed' | 'noAccess';

/** macOS menu bar icons: black template images (with @2x files next to them) that macOS tints for the menu bar. */
export interface MacTrayIcons {
  on: string;
  off: string;
}

export interface TrayHandlers {
  openSettings(): void;
  setEnabled(on: boolean): void;
  retryHelper(): void;
  quit(): void;
  room: {
    joinClipboard(): void;
    create(): void;
    copyCode(): void;
    setMuted(on: boolean): void;
    leave(): void;
    /** Opens settings at the Room section. */
    openSettings(): void;
  };
}

/** What the tray shows about the room: `code` is null when not in one. */
export interface TrayRoom {
  code: string | null;
  count: number;
  muted: boolean;
}

/** Re-colours a premultiplied BGRA bitmap pixel by pixel. */
function recolor(base: NativeImage, fn: (r: number, g: number, b: number, a: number) => [number, number, number, number]): NativeImage {
  const { width, height } = base.getSize();
  const bmp = Buffer.from(base.toBitmap());
  for (let i = 0; i < bmp.length; i += 4) {
    const [r, g, b, a] = fn(bmp[i + 2], bmp[i + 1], bmp[i], bmp[i + 3]);
    bmp[i] = b;
    bmp[i + 1] = g;
    bmp[i + 2] = r;
    bmp[i + 3] = a;
  }
  return nativeImage.createFromBitmap(bmp, { width, height });
}

export class AppTray {
  private readonly tray: Tray;
  private readonly icons: Record<Exclude<TrayMode, 'noAccess'>, NativeImage>;
  private mode: TrayMode = 'on';
  private enabled = true;
  private room: TrayRoom = { code: null, count: 0, muted: false };
  private destroyed = false;

  /** `mac` switches to menu bar behaviour: template icons, and a click opens the menu (which has Settings…). */
  constructor(
    iconPath: string,
    private readonly handlers: TrayHandlers,
    private text: Strings = strings('en'),
    mac?: MacTrayIcons,
  ) {
    const size = mac ? 18 : 32;
    const base = nativeImage.createFromPath(iconPath).resize({ width: size, height: size, quality: 'best' });
    // solid orange silhouette = warning (in colour on macOS too, so it stands out in the menu bar)
    const failed = recolor(base, (_r, _g, _b, a) => [a, Math.round(a * 0.55), Math.round(a * 0.15), a]);
    if (mac) {
      const template = (file: string): NativeImage => {
        const img = nativeImage.createFromPath(file);
        img.setTemplateImage(true);
        return img;
      };
      this.icons = { on: template(mac.on), off: template(mac.off), failed };
    } else {
      this.icons = {
        on: base,
        // grey and half transparent (scale every channel: the bitmap is premultiplied)
        off: recolor(base, (r, g, b, a) => {
          const l = Math.round((0.3 * r + 0.59 * g + 0.11 * b) * 0.5);
          return [l, l, l, Math.round(a * 0.5)];
        }),
        failed,
      };
    }
    this.tray = new Tray(this.icons.on);
    if (!mac) this.tray.on('click', () => handlers.openSettings());
    this.render();
  }

  /** A no-op once destroyed: helper events can still arrive while the app is quitting. */
  set(mode: TrayMode, enabled: boolean): void {
    if (this.destroyed) return;
    this.mode = mode;
    this.enabled = enabled;
    this.render();
  }

  setRoom(room: TrayRoom): void {
    if (this.destroyed) return;
    const r = this.room;
    if (r.code === room.code && r.count === room.count && r.muted === room.muted) return; // room state changes often
    this.room = room;
    this.render();
  }

  /** Switches the tooltip and menu to another language. */
  setText(text: Strings): void {
    if (this.destroyed) return;
    this.text = text;
    this.render();
  }

  /** Idempotent. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.tray.destroy();
  }

  private render(): void {
    const failed = this.mode === 'failed';
    const noAccess = this.mode === 'noAccess';
    this.tray.setImage(this.icons[this.mode === 'noAccess' ? 'failed' : this.mode]);
    const t = this.text;
    this.tray.setToolTip(failed ? t.trayTipFailed : noAccess ? t.trayTipNoAccess : t.trayTip(this.enabled));
    const items: MenuItemConstructorOptions[] = [
      {
        label: t.trayEnabled, type: 'checkbox', checked: this.enabled, enabled: !failed && !noAccess,
        click: (item) => this.handlers.setEnabled(item.checked),
      },
    ];
    if (failed) items.push({ label: t.trayRestart, click: () => this.handlers.retryHelper() });
    items.push(
      { type: 'separator' },
      { label: t.trayRoom, submenu: this.roomMenu() },
      { label: t.traySettings, click: () => this.handlers.openSettings() },
      { label: t.trayQuit, click: () => this.handlers.quit() },
    );
    this.tray.setContextMenu(Menu.buildFromTemplate(items));
  }

  private roomMenu(): MenuItemConstructorOptions[] {
    const t = this.text;
    const r = this.handlers.room;
    const settings: MenuItemConstructorOptions = { label: t.trayRoomSettings, click: () => r.openSettings() };
    if (!this.room.code) {
      return [
        { label: t.trayRoomJoinClipboard, click: () => r.joinClipboard() },
        { label: t.trayRoomCreate, click: () => r.create() },
        settings,
      ];
    }
    return [
      { label: t.trayRoomLabel(this.room.code, this.room.count), enabled: false },
      { type: 'separator' },
      { label: t.trayRoomCopy, click: () => r.copyCode() },
      { label: t.trayRoomMute, type: 'checkbox', checked: this.room.muted, click: (item) => r.setMuted(item.checked) },
      { label: t.trayRoomLeave, click: () => r.leave() },
      { type: 'separator' },
      settings,
    ];
  }
}
