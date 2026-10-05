import { Button, Input, Slider, Spinner } from '@fluentui/react-components';
import {
  ArrowSync24Regular, Color24Regular, Desktop24Regular, Person24Regular, PeopleCommunity24Regular, SpeakerMute24Regular,
  TopSpeed24Regular, Warning24Regular,
} from '@fluentui/react-icons';
import { useEffect, useRef, useState } from 'react';
import type { RoomMember, RoomState } from '../../../shared/room';
import { TAG_COLORS } from '../../../shared/roomColors';
import { clampNameInput } from '../../../shared/roomProtocol';
import { LIMITS, type Settings } from '../../../shared/settings';
import { api } from '../api';
import { useText } from '../text';
import type { Update } from '../useAppState';
import { useRoomState } from '../useRoomState';
import { SettingRow, SwitchRow } from './rows';

const { max: LIMIT_MAX } = LIMITS.incomingPingLimit;
/** The slider runs 1…max+1; its last stop is Unlimited (stored as 0). */
const toSlider = (limit: number): number => (limit === 0 ? LIMIT_MAX + 1 : limit);
const fromSlider = (v: number): number => (v > LIMIT_MAX ? 0 : v);

function NameRow({ value, onSave }: { value: string; onSave(name: string): void }) {
  const t = useText();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const save = () => {
    if (draft !== value) onSave(draft);
  };
  return (
    <SettingRow icon={<Person24Regular />} title={t.roomName} description={t.roomNameDesc}>
      <Input value={draft} style={{ width: 190 }} onChange={(_, d) => setDraft(clampNameInput(d.value))} onBlur={save}
        onKeyDown={(e) => e.key === 'Enter' && save()} />
    </SettingRow>
  );
}

function JoinCard() {
  const t = useText();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const touched = useRef(false);
  useEffect(() => {
    void api.clipboardRoomCode().then((c) => {
      if (c && !touched.current) setCode(c);
    });
  }, []);
  const join = async () => {
    setBusy(true);
    const r = await api.joinRoom(code);
    setBusy(false);
    setError(r.ok ? null : r.error === 'mistyped' ? t.roomMistyped : r.error === 'failed' ? t.roomJoinFailed : t.roomInvalid);
  };
  return (
    <div className="card roomJoin">
      <span className="icon"><PeopleCommunity24Regular /></span>
      <div className="lbl">
        {t.roomJoinTitle}
        <span className="desc">{t.roomJoinDesc}</span>
        <span className="desc">{t.roomNetworkHint}</span>
      </div>
      <div className="ctl">
        <Input placeholder="PING-XXXXX-XXXXX" value={code} style={{ width: 190 }}
          onChange={(_, d) => {
            touched.current = true;
            setCode(d.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && void join()} />
        <Button appearance="primary" disabled={busy || !code.trim()} onClick={() => void join()}>{t.roomJoin}</Button>
        <Button disabled={busy} onClick={() => {
          setBusy(true); // a double click would create a room and replace it at once
          void api.createRoom().finally(() => setBusy(false));
        }}>{t.roomCreate}</Button>
      </div>
      {error ? <div className="roomError">{error}</div> : null}
    </div>
  );
}

function MemberRow({ m }: { m: RoomMember }) {
  const t = useText();
  return (
    <div className="member">
      <span className="tagDot" style={{ background: TAG_COLORS[m.color] }} />
      <span className="memberName">
        {m.name}
        {m.self ? <span className="desc inline">({t.roomYou})</span> : null}
      </span>
      {m.self ? null : <span className={`badge ${m.path}`}>{t.roomPath[m.path]}</span>}
      {m.status === 'paused' ? <span className="badge">{t.roomPaused}</span> : null}
      {m.status === 'muted' ? <span className="badge">{t.roomMutedBadge}</span> : null}
      {m.needsUpdate ? <span className="badge bad">{t.roomNeedsUpdate}</span> : null}
      {m.self ? null : (
        <Button size="small" appearance={m.muted ? 'primary' : 'secondary'} onClick={() => void api.muteMember(m.peer, !m.muted)}>
          {m.muted ? t.roomUnmuteMember : t.roomMuteMember}
        </Button>
      )}
    </div>
  );
}

function InRoom({ room }: { room: RoomState }) {
  const t = useText();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  const alone = room.members.length <= 1;
  return (
    <>
      <div className="card">
        <span className="icon"><PeopleCommunity24Regular /></span>
        <div className="lbl">
          <span className="roomCode">{room.code}</span>
          <span className="desc">{room.phase === 'joining' ? t.roomJoining : t.roomShareDesc}</span>
        </div>
        <div className="ctl">
          {room.phase === 'joining' ? <Spinner size="tiny" /> : null}
          <Button onClick={() => {
            void api.copyRoomCode();
            setCopied(true);
          }}>{copied ? t.roomCopied : t.roomCopy}</Button>
          <Button onClick={() => void api.leaveRoom()}>{t.roomLeave}</Button>
        </div>
      </div>
      {room.lan === 'unavailable' ? (
        <div className="card permission">
          <span className="icon"><Warning24Regular /></span>
          <div className="lbl">
            <b>{t.roomLanUnavailable}</b>
            <span className="desc">{t.roomLanUnavailableDesc}</span>
          </div>
        </div>
      ) : null}
      <div className="card members">
        {room.members.map((m) => <MemberRow key={m.peer} m={m} />)}
        {alone ? <div className="desc roomWaiting">{room.lonely ? `${t.roomWaiting} ${t.roomLonely}` : t.roomWaiting}</div> : null}
        {room.clockSkew ? <div className="desc roomWaiting warnText">{t.roomClockSkew}</div> : null}
      </div>
    </>
  );
}

export function RoomSection({ settings: s, update }: { settings: Settings; update: Update }) {
  const t = useText();
  const room = useRoomState();
  if (!room) return null;
  return (
    <>
      <NameRow value={s.displayName} onSave={(displayName) => void update({ displayName })} />
      <SettingRow icon={<Color24Regular />} title={t.roomColor}>
        <div className="swatches" role="radiogroup" aria-label={t.roomColor}>
          {TAG_COLORS.map((c, i) => (
            <button key={c} type="button" role="radio" aria-checked={s.tagColor === i} aria-label={t.roomColorLabel(i + 1)}
              className={`swatch${s.tagColor === i ? ' sel' : ''}`} style={{ background: c }} onClick={() => void update({ tagColor: i })} />
          ))}
        </div>
      </SettingRow>
      {room.phase === 'idle' ? <JoinCard /> : <InRoom room={room} />}
      <SwitchRow icon={<SpeakerMute24Regular />} title={t.roomMute} description={t.roomMuteDesc}
        checked={s.roomMuted} onChange={(v) => void update({ roomMuted: v })} />
      <SettingRow icon={<TopSpeed24Regular />} title={t.roomLimit} description={t.roomLimitDesc} dim={s.roomMuted}>
        <Slider min={1} max={LIMIT_MAX + 1} step={1} value={toSlider(s.incomingPingLimit)} style={{ width: 200 }}
          onChange={(_, d) => void update({ incomingPingLimit: fromSlider(d.value) })} />
        <span className="value">{t.roomLimitValue(s.incomingPingLimit)}</span>
      </SettingRow>
      <SwitchRow icon={<ArrowSync24Regular />} title={t.roomRejoin} checked={s.rejoinRoom} onChange={(v) => void update({ rejoinRoom: v })} />
      <SettingRow icon={<Desktop24Regular />} title={t.roomDisplays} description={t.roomDisplaysDesc}>
        <span className="displays">
          {room.displays.map((d) => (
            <span key={d.number}>#{d.number}{d.primary ? ` ${t.roomPrimary}` : ''} · {d.width}×{d.height}</span>
          ))}
        </span>
      </SettingRow>
      <p className="desc roomNote">{t.roomPrivacy} {t.roomHelp}</p>
    </>
  );
}
