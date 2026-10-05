import type { Platform } from './platform';

/** Modifier bitmask shared with the native helper (`toggleMods`). On macOS `win` is Command. */
export const MOD = { ctrl: 1, alt: 2, shift: 4, win: 8 } as const;

/**
 * A toggle hotkey needs at least one of these. Shift alone is not enough: Shift+letter is ordinary typing,
 * and the helper swallows the hotkey system-wide.
 */
export const HOTKEY_PRIMARY_MODS: number = MOD.ctrl | MOD.alt | MOD.win;

export interface Hotkey {
  mods: number;
  vk: number;
}

/**
 * Keys a custom trigger must never use. The helper swallows the trigger key everywhere while pinging is on, so
 * these would break typing, form submission, focus movement or caret movement system-wide. Escape also cancels capture.
 */
export const UNSAFE_TRIGGER_VKS: readonly number[] = [
  0x0d, // Enter
  0x09, // Tab
  0x08, // Backspace
  0x20, // Space
  0x1b, // Escape
  0x25, 0x26, 0x27, 0x28, // arrow keys
];

const NAMED_CODES: Record<string, number> = {
  Space: 0x20, Enter: 0x0d, Tab: 0x09, Backspace: 0x08, Escape: 0x1b, Insert: 0x2d, Delete: 0x2e,
  Home: 0x24, End: 0x23, PageUp: 0x21, PageDown: 0x22, ArrowLeft: 0x25, ArrowUp: 0x26,
  ArrowRight: 0x27, ArrowDown: 0x28, CapsLock: 0x14, Pause: 0x13, ScrollLock: 0x91,
  PrintScreen: 0x2c, ContextMenu: 0x5d, Backquote: 0xc0, Minus: 0xbd, Equal: 0xbb,
  BracketLeft: 0xdb, BracketRight: 0xdd, Backslash: 0xdc, Semicolon: 0xba, Quote: 0xde,
  Comma: 0xbc, Period: 0xbe, Slash: 0xbf, NumpadMultiply: 0x6a, NumpadAdd: 0x6b,
  NumpadSubtract: 0x6d, NumpadDecimal: 0x6e, NumpadDivide: 0x6f,
};

/** KeyboardEvent.code → Windows virtual-key code. Modifiers and unknown codes → null. */
export function codeToVk(code: string): number | null {
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1].charCodeAt(0);
  m = /^Digit([0-9])$/.exec(code);
  if (m) return 0x30 + Number(m[1]);
  m = /^Numpad([0-9])$/.exec(code);
  if (m) return 0x60 + Number(m[1]);
  m = /^F([0-9]{1,2})$/.exec(code);
  if (m) {
    const n = Number(m[1]);
    return n >= 1 && n <= 24 ? 0x6f + n : null;
  }
  return NAMED_CODES[code] ?? null;
}

const VK_LABELS: Record<number, string> = {
  0x20: 'Space', 0x0d: 'Enter', 0x09: 'Tab', 0x08: 'Backspace', 0x1b: 'Esc', 0x2d: 'Insert',
  0x2e: 'Delete', 0x24: 'Home', 0x23: 'End', 0x21: 'Page Up', 0x22: 'Page Down', 0x25: '←',
  0x26: '↑', 0x27: '→', 0x28: '↓', 0x14: 'Caps Lock', 0x13: 'Pause', 0x91: 'Scroll Lock',
  0x2c: 'Print Screen', 0x5d: 'Menu', 0xc0: '`', 0xbd: '-', 0xbb: '=', 0xdb: '[', 0xdd: ']',
  0xdc: '\\', 0xba: ';', 0xde: "'", 0xbc: ',', 0xbe: '.', 0xbf: '/', 0x6a: 'Num *',
  0x6b: 'Num +', 0x6d: 'Num -', 0x6e: 'Num .', 0x6f: 'Num /',
};

/** Keys macOS labels differently. */
const VK_LABELS_MAC: Record<number, string> = {
  0x0d: 'Return', 0x08: 'Delete', 0x2e: 'Forward Delete', 0x2d: 'Help', 0x1b: 'Esc',
};

export function vkLabel(vk: number, platform: Platform = 'win'): string {
  if (platform === 'mac' && VK_LABELS_MAC[vk]) return VK_LABELS_MAC[vk];
  if ((vk >= 0x41 && vk <= 0x5a) || (vk >= 0x30 && vk <= 0x39)) return String.fromCharCode(vk);
  if (vk >= 0x60 && vk <= 0x69) return `Num ${vk - 0x60}`;
  if (vk >= 0x70 && vk <= 0x87) return `F${vk - 0x6f}`;
  return VK_LABELS[vk] ?? `Key 0x${vk.toString(16).toUpperCase().padStart(2, '0')}`;
}

export function modLabels(mods: number, platform: Platform = 'win'): string[] {
  const out: string[] = [];
  if (platform === 'mac') {
    // Apple's order: Control, Option, Shift, Command
    if (mods & MOD.ctrl) out.push('⌃');
    if (mods & MOD.alt) out.push('⌥');
    if (mods & MOD.shift) out.push('⇧');
    if (mods & MOD.win) out.push('⌘');
    return out;
  }
  if (mods & MOD.ctrl) out.push('Ctrl');
  if (mods & MOD.alt) out.push('Alt');
  if (mods & MOD.shift) out.push('Shift');
  if (mods & MOD.win) out.push('Win');
  return out;
}

export const hotkeyParts = (h: Hotkey, platform: Platform = 'win'): string[] =>
  [...modLabels(h.mods, platform), vkLabel(h.vk, platform)];
/** "Ctrl + Alt + P" on Windows, "⌃⌥P" on macOS. */
export const hotkeyLabel = (h: Hotkey, platform: Platform = 'win'): string =>
  hotkeyParts(h, platform).join(platform === 'mac' ? '' : ' + ');

const ACCEL_NAMES: Record<number, string> = {
  0x20: 'Space', 0x0d: 'Enter', 0x09: 'Tab', 0x08: 'Backspace', 0x2d: 'Insert', 0x2e: 'Delete',
  0x24: 'Home', 0x23: 'End', 0x21: 'PageUp', 0x22: 'PageDown', 0x25: 'Left', 0x26: 'Up',
  0x27: 'Right', 0x28: 'Down', 0xc0: '`', 0xbd: '-', 0xbb: '=', 0xdb: '[', 0xdd: ']',
  0xdc: '\\', 0xba: ';', 0xde: "'", 0xbc: ',', 0xbe: '.', 0xbf: '/',
};

/** Electron accelerator string, used only for conflict checks. Null when the key has no accelerator name. */
export function hotkeyToAccelerator(h: Hotkey): string | null {
  let key: string | undefined;
  if ((h.vk >= 0x41 && h.vk <= 0x5a) || (h.vk >= 0x30 && h.vk <= 0x39)) key = String.fromCharCode(h.vk);
  else if (h.vk >= 0x70 && h.vk <= 0x87) key = `F${h.vk - 0x6f}`;
  else if (h.vk >= 0x60 && h.vk <= 0x69) key = `num${h.vk - 0x60}`;
  else key = ACCEL_NAMES[h.vk];
  if (!key) return null;
  const mods: string[] = [];
  if (h.mods & MOD.ctrl) mods.push('Control');
  if (h.mods & MOD.alt) mods.push('Alt');
  if (h.mods & MOD.shift) mods.push('Shift');
  if (h.mods & MOD.win) mods.push('Super');
  return [...mods, key].join('+');
}

export function eventMods(e: { ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }): number {
  return (e.ctrlKey ? MOD.ctrl : 0) | (e.altKey ? MOD.alt : 0) | (e.shiftKey ? MOD.shift : 0) | (e.metaKey ? MOD.win : 0);
}
