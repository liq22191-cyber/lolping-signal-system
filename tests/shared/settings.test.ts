import { describe, expect, it } from 'vitest';
import { MOD } from '../../src/shared/keys';
import { formatRoomCode, makeRoomCode } from '../../src/shared/roomCode';
import {
  DEFAULT_SETTINGS, keyboardTriggers, mergeSettings, normalizeSettings, overlaySettings, triggerLabel,
} from '../../src/shared/settings';

describe('normalizeSettings', () => {
  it('returns defaults for missing or non-object input', () => {
    for (const raw of [undefined, null, 42, 'x', [1, 2]]) expect(normalizeSettings(raw)).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values', () => {
    const s = normalizeSettings({ ...DEFAULT_SETTINGS, trigger: 'mouse4', volume: 30, clickPing: true });
    expect(s.trigger).toBe('mouse4');
    expect(s.volume).toBe(30);
    expect(s.clickPing).toBe(true);
  });

  it('clamps and rounds numbers to their limits', () => {
    const s = normalizeSettings({ dragThresholdPx: 0, pingSizePx: 999, pingDurationS: 3.27, volume: 55.6 });
    expect(s.dragThresholdPx).toBe(2);
    expect(s.pingSizePx).toBe(220);
    expect(s.pingDurationS).toBe(3.3);
    expect(s.volume).toBe(56);
  });

  it('replaces wrong types and non-finite numbers with defaults', () => {
    const s = normalizeSettings({ volume: Number.NaN, muted: 'yes', pingSizePx: '120', launchAtStartup: 1 });
    expect(s.volume).toBe(DEFAULT_SETTINGS.volume);
    expect(s.muted).toBe(false);
    expect(s.pingSizePx).toBe(DEFAULT_SETTINGS.pingSizePx);
    expect(s.launchAtStartup).toBe(false);
  });

  it('accepts custom-key triggers and rejects unknown ones', () => {
    expect(normalizeSettings({ trigger: { vk: 0x56 } }).trigger).toEqual({ vk: 0x56 });
    expect(normalizeSettings({ trigger: { vk: 300 } }).trigger).toBe('alt');
    expect(normalizeSettings({ trigger: 'meta' }).trigger).toBe('alt');
  });

  it('requires a modifier and a valid key in the toggle hotkey', () => {
    expect(normalizeSettings({ toggleHotkey: { mods: MOD.ctrl, vk: 0x4b } }).toggleHotkey).toEqual({ mods: 1, vk: 0x4b });
    expect(normalizeSettings({ toggleHotkey: { mods: 0, vk: 0x4b } }).toggleHotkey).toEqual(DEFAULT_SETTINGS.toggleHotkey);
    expect(normalizeSettings({ toggleHotkey: { mods: 3, vk: 0 } }).toggleHotkey).toEqual(DEFAULT_SETTINGS.toggleHotkey);
    expect(normalizeSettings({ toggleHotkey: { mods: 99, vk: 0x4b } }).toggleHotkey).toEqual(DEFAULT_SETTINGS.toggleHotkey);
  });

  it('rejects a Shift-only toggle hotkey (it would swallow ordinary typing)', () => {
    expect(normalizeSettings({ toggleHotkey: { mods: MOD.shift, vk: 0x41 } }).toggleHotkey).toEqual(DEFAULT_SETTINGS.toggleHotkey);
    expect(normalizeSettings({ toggleHotkey: { mods: MOD.ctrl | MOD.shift, vk: 0x41 } }).toggleHotkey).toEqual({ mods: 5, vk: 0x41 });
    expect(normalizeSettings({ toggleHotkey: { mods: MOD.alt | MOD.shift, vk: 0x41 } }).toggleHotkey).toEqual({ mods: 6, vk: 0x41 });
    expect(normalizeSettings({ toggleHotkey: { mods: MOD.win | MOD.shift, vk: 0x41 } }).toggleHotkey).toEqual({ mods: 12, vk: 0x41 });
    expect(normalizeSettings({ toggleHotkey: { mods: MOD.win, vk: 0x41 } }).toggleHotkey).toEqual({ mods: 8, vk: 0x41 });
  });

  it('keeps a valid custom wheel and click ping', () => {
    const wheel = ['bait', 'push', 'omw', 'allin', 'assist', 'needvision', 'missing', 'visioncleared'];
    const s = normalizeSettings({ wheel, clickPingId: 'danger' });
    expect(s.wheel).toEqual(wheel);
    expect(s.clickPingId).toBe('danger');
  });

  it('resets an invalid wheel to the default layout', () => {
    const dup = ['push', 'push', 'omw', 'allin', 'assist', 'needvision', 'missing', 'enemyvision'];
    for (const wheel of [dup, ['danger'], 'danger', [...DEFAULT_SETTINGS.wheel.slice(0, 7), 'nope'], undefined]) {
      expect(normalizeSettings({ wheel }).wheel).toEqual(DEFAULT_SETTINGS.wheel);
    }
  });

  it('resets an unknown click ping to the generic ping', () => {
    expect(normalizeSettings({ clickPingId: 'nope' }).clickPingId).toBe('generic');
    expect(normalizeSettings({ clickPingId: 3 }).clickPingId).toBe('generic');
  });

  it('does not share the default wheel array', () => {
    expect(normalizeSettings(undefined).wheel).not.toBe(DEFAULT_SETTINGS.wheel);
  });

  it('does not share the default hotkey object', () => {
    expect(normalizeSettings(undefined).toggleHotkey).not.toBe(DEFAULT_SETTINGS.toggleHotkey);
  });
});

describe('room settings', () => {
  const identity = { name: 'darren', color: 5 };

  it('fills missing room keys from the identity and defaults', () => {
    const s = normalizeSettings({}, 'win', identity);
    expect(s).toMatchObject({
      displayName: 'darren', tagColor: 5, incomingPingLimit: 5, allowInternet: true, rejoinRoom: true,
      lastRoomCode: null, roomMuted: false,
    });
  });

  it('defaults to Player and colour 0 without an identity', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ displayName: 'Player', tagColor: 0 });
  });

  it('clamps the incoming ping limit, 0 meaning unlimited', () => {
    expect(normalizeSettings({ incomingPingLimit: 0 }).incomingPingLimit).toBe(0);
    expect(normalizeSettings({ incomingPingLimit: 99 }).incomingPingLimit).toBe(20);
    expect(normalizeSettings({ incomingPingLimit: -3 }).incomingPingLimit).toBe(0);
    expect(normalizeSettings({ incomingPingLimit: 'x' }).incomingPingLimit).toBe(5);
  });

  it('replaces an invalid tag colour with the identity colour', () => {
    expect(normalizeSettings({ tagColor: 9 }, 'win', identity).tagColor).toBe(5);
    expect(normalizeSettings({ tagColor: 2 }, 'win', identity).tagColor).toBe(2);
  });

  it('sanitises the display name and falls back to the identity name', () => {
    expect(normalizeSettings({ displayName: '‮  Alex  ' }, 'win', identity).displayName).toBe('Alex');
    expect(normalizeSettings({ displayName: '   ' }, 'win', identity).displayName).toBe('darren');
    expect(normalizeSettings({ displayName: 'x'.repeat(40) }).displayName).toHaveLength(16);
    expect(mergeSettings(normalizeSettings({}, 'win', identity), { displayName: '' }, 'win', identity).displayName).toBe('darren');
  });

  it('keeps the last room code only when it is valid, in canonical form', () => {
    expect(normalizeSettings({ lastRoomCode: 'nope' }).lastRoomCode).toBeNull();
    expect(normalizeSettings({ lastRoomCode: 3 }).lastRoomCode).toBeNull();
    const code = makeRoomCode(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9]));
    expect(normalizeSettings({ lastRoomCode: formatRoomCode(code) }).lastRoomCode).toBe(code);
  });
});

describe('mergeSettings', () => {
  it('applies a patch and re-normalizes it', () => {
    const s = mergeSettings(DEFAULT_SETTINGS, { volume: 500, tickSound: false });
    expect(s.volume).toBe(100);
    expect(s.tickSound).toBe(false);
    expect(s.trigger).toBe('alt');
  });
});

describe('helpers', () => {
  it('labels triggers', () => {
    expect(triggerLabel('alt')).toBe('Alt');
    expect(triggerLabel('capslock')).toBe('Caps Lock');
    expect(triggerLabel('mouse5')).toBe('Mouse 5');
    expect(triggerLabel({ vk: 0x56 })).toBe('V');
  });

  it('labels triggers with Mac names on macOS', () => {
    expect(triggerLabel('alt', 'en', 'mac')).toBe('⌥ Option');
    expect(triggerLabel('win', 'en', 'mac')).toBe('⌘ Command');
    expect(triggerLabel({ vk: 0x0d }, 'en', 'mac')).toBe('Return');
  });

  it('offers Caps Lock only on Windows, and replaces a stored one on macOS', () => {
    expect(keyboardTriggers('win')).toContain('capslock');
    expect(keyboardTriggers('mac')).not.toContain('capslock');
    expect(normalizeSettings({ trigger: 'capslock' }).trigger).toBe('capslock');
    expect(normalizeSettings({ trigger: 'capslock' }, 'mac').trigger).toBe('alt');
    expect(mergeSettings(DEFAULT_SETTINGS, { trigger: 'capslock' }, 'mac').trigger).toBe('alt');
    expect(normalizeSettings({ trigger: 'win' }, 'mac').trigger).toBe('win');
  });

  it('extracts overlay settings', () => {
    expect(overlaySettings(DEFAULT_SETTINGS)).toEqual({
      pingSizePx: 110, pingDurationS: 3.2, volume: 70, muted: false, tickSound: true,
      wheel: ['danger', 'push', 'omw', 'allin', 'assist', 'needvision', 'missing', 'enemyvision'], clickPingId: 'generic',
      emoteWheel: ['wellplayed', 'weak', 'teemo_good', 'teemo_shocked', 'amumu_cry', 'for_me', 'ff20', 'laugh_cry'],
      emoteSizePx: 160, emoteDurationS: 3.2,
    });
  });

  it('defaults the emote trigger to Ctrl and keeps it off the ping trigger', () => {
    expect(normalizeSettings(undefined).emoteTrigger).toBe('ctrl');
    // A stored emote trigger equal to the ping trigger is replaced.
    expect(normalizeSettings({ trigger: 'ctrl', emoteTrigger: 'ctrl' }).emoteTrigger).toBe('alt');
    expect(normalizeSettings({ trigger: { vk: 0x56 }, emoteTrigger: { vk: 0x56 } }).emoteTrigger).toBe('ctrl');
    // Mouse triggers can't open the emote wheel.
    expect(normalizeSettings({ emoteTrigger: 'mouse4' }).emoteTrigger).toBe('ctrl');
    // A valid, different one survives.
    expect(normalizeSettings({ emoteTrigger: 'shift' }).emoteTrigger).toBe('shift');
  });

  it('validates the emote wheel like the ping wheel', () => {
    const dup = ['weak', 'weak', 'teemo_good', 'teemo_shocked', 'amumu_cry', 'for_me', 'ff20', 'laugh_cry'];
    expect(normalizeSettings({ emoteWheel: dup }).emoteWheel).toEqual(DEFAULT_SETTINGS.emoteWheel);
    const custom = ['laugh_cry', 'ff20', 'for_me', 'amumu_cry', 'teemo_shocked', 'teemo_good', 'weak', 'wellplayed'];
    expect(normalizeSettings({ emoteWheel: custom }).emoteWheel).toEqual(custom);
    expect(normalizeSettings({ emoteWheel: ['wellplayed'] }).emoteWheel).toEqual(DEFAULT_SETTINGS.emoteWheel);
  });
});
