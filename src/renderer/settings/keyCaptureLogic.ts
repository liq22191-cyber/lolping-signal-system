import { HOTKEY_PRIMARY_MODS, codeToVk, eventMods } from '../../shared/keys';

const MODIFIER_CODES = new Set(['ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight']);

/** The parts of a KeyboardEvent that capture cares about. */
export interface KeyDownLike {
  code: string;
  repeat: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export interface CaptureRules {
  /** A shortcut: at least one of Ctrl, Alt or Win must be held (Shift alone is rejected). */
  requireModifier: boolean;
  /** Virtual-key codes that may not be captured. */
  forbiddenVks?: readonly number[];
}

export type CaptureOutcome =
  | { kind: 'ignore' }
  | { kind: 'cancel' }
  | { kind: 'hint'; hint: 'hintUnusable' | 'hintNotTrigger' | 'hintNeedModifier' }
  | { kind: 'capture'; mods: number; vk: number };

/** Decides what a key press means while a KeyCapture is listening. Hints are keys into the i18n strings. */
export function evaluateKeyDown(e: KeyDownLike, rules: CaptureRules): CaptureOutcome {
  // Auto-repeat of a key held down before listening started (e.g. Enter that chose "Custom key…") is not a choice.
  if (e.repeat) return { kind: 'ignore' };
  if (e.code === 'Escape') return { kind: 'cancel' };
  if (MODIFIER_CODES.has(e.code)) return { kind: 'ignore' };
  const vk = codeToVk(e.code);
  if (vk === null) return { kind: 'hint', hint: 'hintUnusable' };
  if (rules.forbiddenVks?.includes(vk)) return { kind: 'hint', hint: 'hintNotTrigger' };
  const mods = rules.requireModifier ? eventMods(e) : 0;
  if (rules.requireModifier && (mods & HOTKEY_PRIMARY_MODS) === 0) return { kind: 'hint', hint: 'hintNeedModifier' };
  return { kind: 'capture', mods, vk };
}
