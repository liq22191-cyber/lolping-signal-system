import { describe, expect, it } from 'vitest';
import { resolveLang, strings } from '../../src/shared/i18n';
import { ALL_PINGS } from '../../src/shared/pings';
import { normalizeSettings, triggerLabel } from '../../src/shared/settings';

describe('language', () => {
  it('follows the Windows display language when set to auto', () => {
    expect(resolveLang('auto', 'zh-CN')).toBe('zh-CN');
    expect(resolveLang('auto', 'zh-TW')).toBe('zh-CN');
    expect(resolveLang('auto', 'en-US')).toBe('en');
    expect(resolveLang('auto', 'de')).toBe('en');
  });

  it('uses an explicit choice over the system language', () => {
    expect(resolveLang('en', 'zh-CN')).toBe('en');
    expect(resolveLang('zh-CN', 'en-US')).toBe('zh-CN');
  });

  it('has every string in both languages', () => {
    const en = strings('en');
    const zh = strings('zh-CN');
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
    for (const p of ALL_PINGS) expect(zh.pingNames[p.id], p.id).toBeTruthy();
    expect(zh.limitations).toHaveLength(en.limitations.length);
  });

  it('has the same Mac wording in both languages', () => {
    const en = strings('en', 'mac');
    const zh = strings('zh-CN', 'mac');
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
    expect(zh.limitations).toHaveLength(en.limitations.length);
    expect(en.launchAtStartup).toBe('Open at login');
    expect(strings('en').launchAtStartup).toBe('Launch at Windows startup');
    expect(strings('en', 'mac')).toBe(en); // stable identity: the settings page uses it as a React dependency
  });

  it('defaults to auto and rejects unknown values', () => {
    expect(normalizeSettings({}).language).toBe('auto');
    expect(normalizeSettings({ language: 'zh-CN' }).language).toBe('zh-CN');
    expect(normalizeSettings({ language: 'fr' }).language).toBe('auto');
  });

  it('translates mouse trigger names only', () => {
    expect(triggerLabel('mouse4', 'zh-CN')).toBe('鼠标侧键 4');
    expect(triggerLabel('mouse4')).toBe('Mouse 4');
    expect(triggerLabel('alt', 'zh-CN')).toBe('Alt');
  });
});
