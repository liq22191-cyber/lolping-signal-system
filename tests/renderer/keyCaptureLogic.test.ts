import { describe, expect, it } from 'vitest';
import { MOD, UNSAFE_TRIGGER_VKS } from '../../src/shared/keys';
import { evaluateKeyDown, type KeyDownLike } from '../../src/renderer/settings/keyCaptureLogic';

const press = (code: string, mods: Partial<Pick<KeyDownLike, 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>> = {}, repeat = false): KeyDownLike => ({
  code, repeat, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods,
});

const toggle = { requireModifier: true } as const;
const trigger = { requireModifier: false, forbiddenVks: UNSAFE_TRIGGER_VKS } as const;

describe('evaluateKeyDown: repeat guard', () => {
  it('ignores auto-repeat events (holding Enter after choosing "Custom key…")', () => {
    expect(evaluateKeyDown(press('Enter', {}, true), trigger)).toEqual({ kind: 'ignore' });
    expect(evaluateKeyDown(press('KeyV', {}, true), trigger)).toEqual({ kind: 'ignore' });
    expect(evaluateKeyDown(press('KeyP', { ctrlKey: true, altKey: true }, true), toggle)).toEqual({ kind: 'ignore' });
  });
});

describe('evaluateKeyDown: Escape and modifiers', () => {
  it('cancels on Escape', () => {
    expect(evaluateKeyDown(press('Escape'), toggle)).toEqual({ kind: 'cancel' });
    expect(evaluateKeyDown(press('Escape'), trigger)).toEqual({ kind: 'cancel' });
  });

  it('keeps waiting while only a modifier is down', () => {
    for (const code of ['ControlLeft', 'AltRight', 'ShiftLeft', 'MetaLeft']) {
      expect(evaluateKeyDown(press(code, { ctrlKey: true }), toggle)).toEqual({ kind: 'ignore' });
    }
  });

  it('hints on keys that have no virtual-key mapping', () => {
    expect(evaluateKeyDown(press('LaunchMail', { ctrlKey: true }), toggle)).toEqual({ kind: 'hint', hint: 'hintUnusable' });
  });
});

describe('evaluateKeyDown: toggle hotkey (requireModifier)', () => {
  it('captures with Ctrl, Alt or Win', () => {
    expect(evaluateKeyDown(press('KeyP', { ctrlKey: true, altKey: true }), toggle)).toEqual({ kind: 'capture', mods: MOD.ctrl | MOD.alt, vk: 0x50 });
    expect(evaluateKeyDown(press('F8', { ctrlKey: true }), toggle)).toEqual({ kind: 'capture', mods: MOD.ctrl, vk: 0x77 });
    expect(evaluateKeyDown(press('KeyK', { altKey: true }), toggle)).toEqual({ kind: 'capture', mods: MOD.alt, vk: 0x4b });
    expect(evaluateKeyDown(press('KeyK', { metaKey: true }), toggle)).toEqual({ kind: 'capture', mods: MOD.win, vk: 0x4b });
    expect(evaluateKeyDown(press('KeyK', { shiftKey: true, ctrlKey: true }), toggle)).toEqual({ kind: 'capture', mods: MOD.shift | MOD.ctrl, vk: 0x4b });
  });

  it('rejects a bare key', () => {
    expect(evaluateKeyDown(press('KeyA'), toggle)).toEqual({ kind: 'hint', hint: 'hintNeedModifier' });
  });

  it('rejects Shift as the only modifier', () => {
    expect(evaluateKeyDown(press('KeyA', { shiftKey: true }), toggle)).toEqual({ kind: 'hint', hint: 'hintNeedModifier' });
  });

  it('is not affected by the custom-trigger key list', () => {
    expect(evaluateKeyDown(press('Space', { ctrlKey: true }), toggle)).toEqual({ kind: 'capture', mods: MOD.ctrl, vk: 0x20 });
    expect(evaluateKeyDown(press('ArrowUp', { altKey: true }), toggle)).toEqual({ kind: 'capture', mods: MOD.alt, vk: 0x26 });
  });
});

describe('evaluateKeyDown: custom trigger (forbiddenVks)', () => {
  it('captures an ordinary key with no modifier', () => {
    expect(evaluateKeyDown(press('KeyV'), trigger)).toEqual({ kind: 'capture', mods: 0, vk: 0x56 });
    expect(evaluateKeyDown(press('F9'), trigger)).toEqual({ kind: 'capture', mods: 0, vk: 0x78 });
  });

  it('rejects Enter, Tab, Backspace, Space and the arrow keys', () => {
    for (const code of ['Enter', 'Tab', 'Backspace', 'Space', 'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown']) {
      expect(evaluateKeyDown(press(code), trigger)).toEqual({ kind: 'hint', hint: 'hintNotTrigger' });
    }
  });

  it('rejects them even with a modifier held', () => {
    expect(evaluateKeyDown(press('Enter', { shiftKey: true }), trigger)).toEqual({ kind: 'hint', hint: 'hintNotTrigger' });
  });

  it('applies no extra restriction when no list is given', () => {
    expect(evaluateKeyDown(press('Enter'), { requireModifier: false })).toEqual({ kind: 'capture', mods: 0, vk: 0x0d });
  });
});
