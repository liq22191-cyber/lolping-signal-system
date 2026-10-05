import { Button } from '@fluentui/react-components';
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { ALL_EMOTES, DEFAULT_EMOTE_WHEEL, emoteById, emoteUrl, type EmoteId } from '../../../shared/emotes';
import { slotDropPatch, type WheelSource } from '../../../shared/wheelLayout';
import { api } from '../api';
import { useText } from '../text';

// Geometry of the editor wheel, in CSS pixels (same as the ping wheel editor).
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
  wheel: readonly EmoteId[];
  trigger: string;
  onChange: (patch: { emoteWheel?: EmoteId[] }) => void;
}

const activate = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fn();
  }
};

/** The emote wheel editor: the ping WheelEditor without the centre (emotes have no click gesture). */
export function EmoteEditor({ wheel, trigger, onChange }: Props) {
  const t = useText();
  const [picked, setPicked] = useState<WheelSource | null>(null);
  const [hot, setHot] = useState<number | null>(null);
  const drag = useRef<WheelSource | null>(null);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setPicked(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const apply = (src: WheelSource, target: number) => {
    const next = slotDropPatch(wheel, src, target);
    if (next) onChange({ emoteWheel: next });
    setPicked(null);
  };

  const clickTarget = (target: number, here: WheelSource) => {
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

  const dropProps = (target: number) => ({
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

  const name = (id: EmoteId) => t.emoteNames[id];
  const isPicked = (match: (p: WheelSource) => boolean) => (picked !== null && match(picked) ? ' picked' : '');

  return (
    <div className="card wheelEditor">
      <div className="weHead">
        <div className="lbl">
          {t.emoteWheelTitle}
          <span className="desc">{t.emoteWheelDesc(trigger)}</span>
        </div>
        <Button
          onClick={() => {
            setPicked(null);
            onChange({ emoteWheel: [...DEFAULT_EMOTE_WHEEL] });
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
                <img src={emoteUrl(emoteById(id)?.icon ?? 'wellplayed')} alt="" />
              </div>
            );
          })}
        </div>
        <div className="wePool">
          <div className="wePoolTitle">{t.allEmotes}</div>
          <span className="desc">{t.allEmotesDesc}</span>
          <div className="weTiles">
            {ALL_EMOTES.map((e) => {
              const slot = wheel.indexOf(e.id);
              const pick = () => {
                void api.previewEmote(e.id);
                setPicked((cur) => (cur?.from === 'pool' && cur.id === e.id ? null : { from: 'pool', id: e.id }));
              };
              return (
                <div key={e.id} role="button" tabIndex={0}
                  className={`weTile${isPicked((s) => s.from === 'pool' && s.id === e.id)}`}
                  {...dragProps({ from: 'pool', id: e.id })} onClick={pick} onKeyDown={activate(pick)}>
                  {slot >= 0 ? <span className="weWhere">{t.slotNames[slot]}</span> : null}
                  <img src={emoteUrl(e.icon)} alt="" />
                  {name(e.id)}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="weHint" aria-live="polite">{picked ? t.wheelPickHint(name(picked.id as EmoteId)) : ' '}</div>
    </div>
  );
}
