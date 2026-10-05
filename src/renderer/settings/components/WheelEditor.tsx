import { Button } from '@fluentui/react-components';
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { ALL_PINGS, DEFAULT_CLICK_PING, DEFAULT_WHEEL, pingById, textureUrl, type PingId } from '../../../shared/pings';
import { dropPatch, type WheelPatch, type WheelSource, type WheelTarget } from '../../../shared/wheelLayout';
import { api } from '../api';
import { useText } from '../text';

/** Pings that aren't in League's default wheel layout get a "new" badge. */
const NEW_PINGS = new Set<PingId>(['bait', 'visioncleared']);

// Geometry of the editor wheel, in CSS pixels.
const SIZE = 300;
const C = SIZE / 2;
const R_IN = 52;
const R_OUT = 146;
const R_ICON = 100;
const GAP = 0.035;
const pt = (r: number, a: number): string => `${C + r * Math.sin(a)},${C - r * Math.cos(a)}`;
const wedgePath = (i: number): string => {
  const a0 = ((i - 0.5) * Math.PI) / 4 + GAP;
  const a1 = ((i + 0.5) * Math.PI) / 4 - GAP;
  return `M${pt(R_IN, a0)} A${R_IN},${R_IN} 0 0 1 ${pt(R_IN, a1)} L${pt(R_OUT, a1)} A${R_OUT},${R_OUT} 0 0 0 ${pt(R_OUT, a0)}Z`;
};

interface Props {
  wheel: readonly PingId[];
  clickPingId: PingId;
  clickPingOn: boolean;
  trigger: string;
  onChange: (patch: WheelPatch) => void;
}

const activate = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fn();
  }
};

export function WheelEditor({ wheel, clickPingId, clickPingOn, trigger, onChange }: Props) {
  const t = useText();
  const [picked, setPicked] = useState<WheelSource | null>(null);
  const [hot, setHot] = useState<WheelTarget | null>(null);
  const drag = useRef<WheelSource | null>(null);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setPicked(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const apply = (src: WheelSource, target: WheelTarget) => {
    const patch = dropPatch(wheel, clickPingId, src, target);
    if (patch) onChange(patch);
    setPicked(null);
  };

  /** Click on a slot or the centre: place the picked ping there, or pick up what's there. */
  const clickTarget = (target: WheelTarget, here: WheelSource) => {
    if (picked) apply(picked, target);
    else setPicked(here);
  };

  const dragProps = (src: WheelSource) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      drag.current = src;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', src.id);
    },
    onDragEnd: () => {
      drag.current = null;
      setHot(null);
    },
  });

  const dropProps = (target: WheelTarget) => ({
    onDragOver: (e: DragEvent) => {
      if (!drag.current) return;
      e.preventDefault();
      setHot(target);
    },
    onDragLeave: () => setHot((h) => (h === target ? null : h)),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setHot(null);
      if (drag.current) apply(drag.current, target);
      drag.current = null;
    },
  });

  const name = (id: PingId) => t.pingNames[id];
  const isPicked = (match: (p: WheelSource) => boolean) => (picked !== null && match(picked) ? ' picked' : '');
  const centerPing = pingById(clickPingId);

  return (
    <div className="card wheelEditor">
      <div className="weHead">
        <div className="lbl">
          {t.wheelTitle}
          <span className="desc">{t.wheelDesc(trigger)}</span>
        </div>
        <Button
          onClick={() => {
            setPicked(null);
            onChange({ wheel: [...DEFAULT_WHEEL], clickPingId: DEFAULT_CLICK_PING });
          }}
        >
          {t.wheelReset}
        </Button>
      </div>
      <div className="weBody">
        <div className="weWheel" style={{ width: SIZE, height: SIZE }}>
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE}>
            {wheel.map((id, i) => (
              <path key={i} d={wedgePath(i)} className={`weWedge${hot === i ? ' hot' : ''}`} {...dropProps(i)}
                onClick={() => clickTarget(i, { from: 'slot', id, slot: i })} />
            ))}
          </svg>
          {wheel.map((id, i) => {
            const a = (i * Math.PI) / 4;
            const label = t.wheelSlotLabel(t.slotNames[i], name(id));
            return (
              <div key={i} role="button" tabIndex={0} aria-label={label} title={label}
                className={`weSlot${hot === i ? ' hot' : ''}${isPicked((p) => p.from === 'slot' && p.slot === i)}`}
                style={{ left: C + R_ICON * Math.sin(a), top: C - R_ICON * Math.cos(a) }}
                {...dragProps({ from: 'slot', id, slot: i })} {...dropProps(i)}
                onClick={() => clickTarget(i, { from: 'slot', id, slot: i })}
                onKeyDown={activate(() => clickTarget(i, { from: 'slot', id, slot: i }))}>
                <img src={textureUrl(pingById(id)?.icon ?? 'generic_ping')} alt="" />
              </div>
            );
          })}
          <div role="button" tabIndex={0} aria-label={t.wheelCenterLabel(trigger, name(clickPingId))}
            title={t.wheelCenterLabel(trigger, name(clickPingId))}
            className={`weCenter${hot === 'center' ? ' hot' : ''}${clickPingOn ? '' : ' off'}${isPicked((p) => p.from === 'center')}`}
            {...dragProps({ from: 'center', id: clickPingId })} {...dropProps('center')}
            onClick={() => clickTarget('center', { from: 'center', id: clickPingId })}
            onKeyDown={activate(() => clickTarget('center', { from: 'center', id: clickPingId }))}>
            <img src={textureUrl(centerPing?.icon ?? 'generic_ping')} alt="" />
            <span>{t.wheelCenter}</span>
          </div>
        </div>
        <div className="wePool">
          <div className="wePoolTitle">{t.allPings}</div>
          <span className="desc">{t.allPingsDesc}</span>
          <div className="weTiles">
            {ALL_PINGS.map((p) => {
              const slot = wheel.indexOf(p.id);
              const pick = () => {
                void api.previewPing(p.id);
                setPicked((cur) => (cur?.from === 'pool' && cur.id === p.id ? null : { from: 'pool', id: p.id }));
              };
              return (
                <div key={p.id} role="button" tabIndex={0}
                  className={`weTile${isPicked((s) => s.from === 'pool' && s.id === p.id)}`}
                  {...dragProps({ from: 'pool', id: p.id })} onClick={pick} onKeyDown={activate(pick)}>
                  {NEW_PINGS.has(p.id) ? <span className="weNew">{t.wheelNew}</span> : null}
                  {slot >= 0 ? <span className="weWhere">{t.slotNames[slot]}</span> : null}
                  <img src={textureUrl(p.icon)} alt="" />
                  {name(p.id)}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="weHint" aria-live="polite">{picked ? t.wheelPickHint(name(picked.id as PingId)) : ' '}</div>
    </div>
  );
}
