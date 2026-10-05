import { Dropdown, FluentProvider, Option, webDarkTheme, webLightTheme } from '@fluentui/react-components';
import {
  ArrowMove24Regular, CursorClick24Regular, DataPie24Regular, Emoji24Regular, Info24Regular, Keyboard24Regular,
  MusicNote224Regular, Power24Regular, ResizeLarge24Regular, Rocket24Regular, Settings24Regular, Speaker224Regular,
  SpeakerMute24Regular, Timer24Regular, Cursor24Regular, LocalLanguage24Regular, PeopleCommunity24Regular,
} from '@fluentui/react-icons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LANGUAGE_NAMES, LANGUAGE_PREFS, resolveLang, strings, type LanguagePref, type Strings } from '../../shared/i18n';
import type { AppStatus } from '../../shared/ipc';
import { hotkeyParts } from '../../shared/keys';
import { textureUrl } from '../../shared/pings';
import { sameTrigger, triggerLabel, type Settings, type TriggerKey } from '../../shared/settings';
import { api } from './api';
import { AboutSection } from './components/AboutSection';
import { EmoteEditor } from './components/EmoteEditor';
import { KeyCapture } from './components/KeyCapture';
import { PermissionCard } from './components/PermissionCard';
import { RoomSection } from './components/RoomSection';
import { SettingRow, SliderRow, SwitchRow } from './components/rows';
import { StatusCard } from './components/StatusCard';
import { TriggerPicker } from './components/TriggerPicker';
import { WheelEditor } from './components/WheelEditor';
import { TextContext, useText } from './text';
import { macDarkTheme, macLightTheme } from './macTheme';
import { useAppState, type Update } from './useAppState';

const PLATFORM = api.platform;
const MAC = PLATFORM === 'mac';
/** macOS measures the screen in points. */
const LENGTH_UNIT = MAC ? 'pt' : 'px';

const SECTIONS: { id: string; label: (t: Strings) => string; icon: ReactNode }[] = [
  { id: 'trigger', label: (t) => t.navTrigger, icon: <Cursor24Regular /> },
  { id: 'toggle', label: (t) => t.navToggle, icon: <Keyboard24Regular /> },
  { id: 'pings', label: (t) => t.navPings, icon: <Speaker224Regular /> },
  { id: 'wheel', label: (t) => t.navWheel, icon: <DataPie24Regular /> },
  { id: 'emotes', label: (t) => t.navEmotes, icon: <Emoji24Regular /> },
  { id: 'room', label: (t) => t.navRoom, icon: <PeopleCommunity24Regular /> },
  { id: 'app', label: (t) => t.navApp, icon: <Settings24Regular /> },
];

function useDarkMode(): boolean {
  const query = '(prefers-color-scheme: dark)';
  const [dark, setDark] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const onChange = () => setDark(m.matches);
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  }, []);
  return dark;
}

export function App() {
  const dark = useDarkMode();
  const { settings, status, update } = useAppState();
  useEffect(() => {
    document.documentElement.dataset.platform = PLATFORM; // mac.css restyles the page for macOS
  }, []);
  const theme = MAC ? (dark ? macDarkTheme : macLightTheme) : dark ? webDarkTheme : webLightTheme;
  return (
    <FluentProvider theme={theme} style={{ background: 'transparent', height: '100%' }}>
      {settings && status ? (
        <TextContext.Provider value={strings(resolveLang(settings.language, navigator.language), PLATFORM)}>
          <SettingsPage settings={settings} status={status} update={update} />
        </TextContext.Provider>
      ) : null}
    </FluentProvider>
  );
}

function SettingsPage({ settings: s, status, update }: { settings: Settings; status: AppStatus; update: Update }) {
  const t = useText();
  useEffect(() => {
    document.documentElement.lang = t.lang; // picks the right CJK glyphs
  }, [t]);
  const mainRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(SECTIONS[0].id);
  const off = !status.enabled || status.helper === 'failed';
  const trigger = triggerLabel(s.trigger, t.lang, PLATFORM);
  const emoteTrigger = triggerLabel(s.emoteTrigger, t.lang, PLATFORM);
  const [hotkeyError, setHotkeyError] = useState<string | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const mouseTrigger = s.trigger === 'mouse4' || s.trigger === 'mouse5';
  const customTrigger = typeof s.trigger === 'object';

  /** The two wheels share one gesture state machine, so their triggers must differ. */
  const changePingTrigger = (next: TriggerKey) => {
    if (sameTrigger(next, s.emoteTrigger)) return setTriggerError(t.triggerConflict);
    setTriggerError(null);
    void update({ trigger: next });
  };
  const changeEmoteTrigger = (next: TriggerKey) => {
    if (sameTrigger(next, s.trigger)) return setTriggerError(t.triggerConflict);
    setTriggerError(null);
    void update({ emoteTrigger: next });
  };
  const triggerErrorNote = triggerError ? (
    <span className="desc" style={{ color: 'var(--colorPaletteRedForeground1)' }}>{triggerError}</span>
  ) : null;

  useEffect(() => {
    const show = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    const initial = location.hash.slice(1);
    if (initial) requestAnimationFrame(() => show(initial));
    return api.onShowSection(show);
  }, []);

  const onScroll = () => {
    const main = mainRef.current;
    if (!main) return;
    let current = SECTIONS[0].id;
    for (const sec of SECTIONS) {
      const el = document.getElementById(sec.id);
      if (el && el.offsetTop - main.offsetTop - 40 <= main.scrollTop) current = sec.id;
    }
    setActive(current);
  };

  return (
    <div className="app">
      <div className="titlebar">
        <img src={textureUrl('generic_ping')} alt="" />
        lolPing
      </div>
      <nav className="side">
        <div className="brand">
          <img src={textureUrl('pingwheel_basicpingrender')} alt="" />
          <div>
            <b>lolPing</b>
            <span className="desc">{t.tagline}</span>
          </div>
        </div>
        {SECTIONS.map((sec) => (
          <button key={sec.id} className={`navItem${active === sec.id ? ' sel' : ''}`} onClick={() => document.getElementById(sec.id)?.scrollIntoView({ behavior: 'smooth' })}>
            {sec.icon}
            {sec.label(t)}
          </button>
        ))}
      </nav>
      <main className="content" ref={mainRef} onScroll={onScroll}>
        <h1 className="pageTitle">{t.pageTitle}</h1>
        {status.helper === 'noAccess' ? <PermissionCard stale={status.staleAccess === true} /> : null}
        <StatusCard settings={s} status={status} />

        <div className="section" id="trigger">{t.navTrigger}</div>
        <SettingRow icon={<Cursor24Regular />} title={t.triggerKey} dim={off}
          description={(
            <>
              {mouseTrigger ? t.triggerMouseDesc : t.triggerKeyDesc}
              {customTrigger ? <span className="desc">{t.customKeyNote}</span> : null}
              {triggerErrorNote}
            </>
          )}>
          <TriggerPicker value={s.trigger} onChange={changePingTrigger} />
        </SettingRow>
        <SliderRow limit="dragThresholdPx" icon={<ArrowMove24Regular />} title={t.dragDistance} description={t.dragDistanceDesc}
          value={s.dragThresholdPx} format={(v) => `${v} ${LENGTH_UNIT}`} onChange={(v) => void update({ dragThresholdPx: v })} dim={off} />
        <SwitchRow icon={<CursorClick24Regular />} title={t.clickPing(trigger)}
          description={t.clickPingDesc(trigger)}
          checked={s.clickPing} onChange={(v) => void update({ clickPing: v })} dim={off} />

        <div className="section" id="toggle">{t.navToggle}</div>
        <SettingRow icon={<Keyboard24Regular />} title={t.toggleShortcut} description={t.toggleShortcutDesc}>
          <KeyCapture
            parts={hotkeyParts(s.toggleHotkey, PLATFORM)}
            requireModifier
            error={hotkeyError}
            onCapture={async (c) => {
              const result = await update({ toggleHotkey: c });
              setHotkeyError(result.ok ? null : result.error);
            }}
          />
        </SettingRow>
        <SwitchRow icon={<Power24Regular />} title={t.startEnabled} description={t.startEnabledDesc}
          checked={s.enabledOnStart} onChange={(v) => void update({ enabledOnStart: v })} />

        <div className="section" id="pings">{t.navPings}</div>
        <SliderRow limit="pingSizePx" icon={<ResizeLarge24Regular />} title={t.pingSize} value={s.pingSizePx}
          format={(v) => `${v} ${LENGTH_UNIT}`} onChange={(v) => void update({ pingSizePx: v })} />
        <SliderRow limit="pingDurationS" icon={<Timer24Regular />} title={t.pingDuration} description={t.pingDurationDesc}
          value={s.pingDurationS} format={(v) => `${v.toFixed(1)} s`} onChange={(v) => void update({ pingDurationS: v })} />
        <SliderRow limit="volume" icon={<Speaker224Regular />} title={t.volume} value={s.volume}
          format={(v) => `${v}`} onChange={(v) => void update({ volume: v })} dim={s.muted} />
        <SwitchRow icon={<SpeakerMute24Regular />} title={t.mute} checked={s.muted} onChange={(v) => void update({ muted: v })} />
        <SwitchRow icon={<MusicNote224Regular />} title={t.tickSound} description={t.tickSoundDesc}
          checked={s.tickSound} onChange={(v) => void update({ tickSound: v })} />

        <div className="section" id="wheel">{t.navWheel}</div>
        <WheelEditor wheel={s.wheel} clickPingId={s.clickPingId} clickPingOn={s.clickPing} trigger={trigger}
          onChange={(patch) => void update(patch)} />

        <div className="section" id="emotes">{t.navEmotes}</div>
        <SettingRow icon={<Emoji24Regular />} title={t.emoteTriggerKey} dim={off}
          description={(<>{t.emoteTriggerKeyDesc}{triggerErrorNote}</>)}>
          <TriggerPicker value={s.emoteTrigger} allowMouse={false} onChange={changeEmoteTrigger} />
        </SettingRow>
        <SliderRow limit="emoteSizePx" icon={<ResizeLarge24Regular />} title={t.emoteSize} value={s.emoteSizePx}
          format={(v) => `${v} ${LENGTH_UNIT}`} onChange={(v) => void update({ emoteSizePx: v })} />
        <SliderRow limit="emoteDurationS" icon={<Timer24Regular />} title={t.emoteDuration} description={t.emoteDurationDesc}
          value={s.emoteDurationS} format={(v) => `${v.toFixed(1)} s`} onChange={(v) => void update({ emoteDurationS: v })} />
        <EmoteEditor wheel={s.emoteWheel} trigger={emoteTrigger} onChange={(patch) => void update(patch)} />

        <div className="section" id="room">{t.navRoom}</div>
        <RoomSection settings={s} update={update} />

        <div className="section" id="app">{t.navApp}</div>
        <SwitchRow icon={<Rocket24Regular />} title={t.launchAtStartup} description={t.launchAtStartupDesc}
          checked={s.launchAtStartup} onChange={(v) => void update({ launchAtStartup: v })} />
        <SettingRow icon={<LocalLanguage24Regular />} title={t.language} description={t.languageDesc}>
          <Dropdown
            style={{ minWidth: 170 }}
            value={s.language === 'auto' ? t.languageAuto : LANGUAGE_NAMES[s.language]}
            selectedOptions={[s.language]}
            onOptionSelect={(_, d) => void update({ language: d.optionValue as LanguagePref })}
          >
            {LANGUAGE_PREFS.map((pref) => (
              <Option key={pref} value={pref} text={pref === 'auto' ? t.languageAuto : LANGUAGE_NAMES[pref]}>
                {pref === 'auto' ? t.languageAuto : LANGUAGE_NAMES[pref]}
              </Option>
            ))}
          </Dropdown>
        </SettingRow>
        <AboutSection icon={<Info24Regular />} />
      </main>
    </div>
  );
}
