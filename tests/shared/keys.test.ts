import { describe, expect, it } from 'vitest';
import {
  MOD, UNSAFE_TRIGGER_VKS, codeToVk, eventMods, hotkeyLabel, hotkeyParts, hotkeyToAccelerator, modLabels, vkLabel,
} from '../../src/shared/keys';

describe('UNSAFE_TRIGGER_VKS', () => {
  it('lists the keys that must never become a swallowed custom trigger', () => {
    for (const vk of [0x0d, 0x09, 0x08, 0x20, 0x1b, 0x25, 0x26, 0x27, 0x28]) expect(UNSAFE_TRIGGER_VKS).toContain(vk);
  });

  it('matches what codeToVk reports for those keys', () => {
    for (const code of ['Enter', 'Tab', 'Backspace', 'Space', 'Escape', 'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown']) {
      expect(UNSAFE_TRIGGER_VKS).toContain(codeToVk(code));
    }
  });

  it('does not forbid ordinary keys', () => {
    for (const vk of [0x41, 0x56, 0x70, 0xc0]) expect(UNSAFE_TRIGGER_VKS).not.toContain(vk);
  });
});

describe('codeToVk', () => {
  it('maps letters, digits, numpad and function keys', () => {
    expect(codeToVk('KeyP')).toBe(0x50);
    expect(codeToVk('Digit5')).toBe(0x35);
    expect(codeToVk('Numpad7')).toBe(0x67);
    expect(codeToVk('F1')).toBe(0x70);
    expect(codeToVk('F24')).toBe(0x87);
    expect(codeToVk('F25')).toBeNull();
  });

  it('maps named keys and rejects modifiers and unknown codes', () => {
    expect(codeToVk('Backquote')).toBe(0xc0);
    expect(codeToVk('CapsLock')).toBe(0x14);
    expect(codeToVk('ShiftLeft')).toBeNull();
    expect(codeToVk('AltRight')).toBeNull();
    expect(codeToVk('LaunchMail')).toBeNull();
  });
});

describe('labels', () => {
  it('labels virtual keys', () => {
    expect(vkLabel(0x50)).toBe('P');
    expect(vkLabel(0x70)).toBe('F1');
    expect(vkLabel(0x63)).toBe('Num 3');
    expect(vkLabel(0xc0)).toBe('`');
    expect(vkLabel(0xe2)).toBe('Key 0xE2');
  });

  it('labels modifiers in Ctrl, Alt, Shift, Win order', () => {
    expect(modLabels(MOD.win | MOD.ctrl | MOD.shift | MOD.alt)).toEqual(['Ctrl', 'Alt', 'Shift', 'Win']);
    expect(modLabels(0)).toEqual([]);
  });

  it('labels hotkeys', () => {
    const h = { mods: MOD.ctrl | MOD.alt, vk: 0x50 };
    expect(hotkeyParts(h)).toEqual(['Ctrl', 'Alt', 'P']);
    expect(hotkeyLabel(h)).toBe('Ctrl + Alt + P');
  });
});

describe('hotkeyToAccelerator', () => {
  it('builds Electron accelerators', () => {
    expect(hotkeyToAccelerator({ mods: MOD.ctrl | MOD.alt, vk: 0x50 })).toBe('Control+Alt+P');
    expect(hotkeyToAccelerator({ mods: MOD.win | MOD.shift, vk: 0x70 })).toBe('Shift+Super+F1');
    expect(hotkeyToAccelerator({ mods: MOD.ctrl, vk: 0x26 })).toBe('Control+Up');
  });

  it('returns null for keys without an accelerator name', () => {
    expect(hotkeyToAccelerator({ mods: MOD.ctrl, vk: 0xe2 })).toBeNull();
  });
});

describe('eventMods', () => {
  it('converts KeyboardEvent flags to the bitmask', () => {
    expect(eventMods({ ctrlKey: true, altKey: true, shiftKey: false, metaKey: false })).toBe(3);
    expect(eventMods({ ctrlKey: false, altKey: false, shiftKey: true, metaKey: true })).toBe(12);
  });
});

describe('macOS labels', () => {
  it('uses Apple modifier symbols in Apple order', () => {
    expect(modLabels(MOD.win | MOD.ctrl | MOD.shift | MOD.alt, 'mac')).toEqual(['⌃', '⌥', '⇧', '⌘']);
    expect(hotkeyParts({ mods: MOD.ctrl | MOD.alt, vk: 0x50 }, 'mac')).toEqual(['⌃', '⌥', 'P']);
    expect(hotkeyLabel({ mods: MOD.ctrl | MOD.alt, vk: 0x50 }, 'mac')).toBe('⌃⌥P');
  });

  it('names keys the Mac way', () => {
    expect(vkLabel(0x0d, 'mac')).toBe('Return');
    expect(vkLabel(0x08, 'mac')).toBe('Delete');
    expect(vkLabel(0x0d)).toBe('Enter');
    expect(vkLabel(0x50, 'mac')).toBe('P');
  });
});
