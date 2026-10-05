import { Slider, Switch } from '@fluentui/react-components';
import type { ReactNode } from 'react';
import { LIMITS } from '../../../shared/settings';
import { useText } from '../text';

export function SettingRow(props: { icon: ReactNode; title: ReactNode; description?: ReactNode; dim?: boolean; children: ReactNode }) {
  return (
    <div className={`card${props.dim ? ' dim' : ''}`}>
      <span className="icon">{props.icon}</span>
      <div className="lbl">
        {props.title}
        {props.description ? <span className="desc">{props.description}</span> : null}
      </div>
      <div className="ctl">{props.children}</div>
    </div>
  );
}

export function SwitchRow(props: { icon: ReactNode; title: ReactNode; description?: ReactNode; checked: boolean; onChange(v: boolean): void; dim?: boolean }) {
  const t = useText();
  return (
    <SettingRow icon={props.icon} title={props.title} description={props.description} dim={props.dim}>
      <Switch checked={props.checked} onChange={(_, d) => props.onChange(d.checked)} label={props.checked ? t.on : t.off} labelPosition="before" />
    </SettingRow>
  );
}

export function SliderRow(props: {
  limit: keyof typeof LIMITS;
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  value: number;
  format(v: number): string;
  onChange(v: number): void;
  dim?: boolean;
}) {
  const { min, max, step } = LIMITS[props.limit];
  return (
    <SettingRow icon={props.icon} title={props.title} description={props.description} dim={props.dim}>
      <Slider min={min} max={max} step={step} value={props.value} onChange={(_, d) => props.onChange(d.value)} style={{ width: 200 }} />
      <span className="value">{props.format(props.value)}</span>
    </SettingRow>
  );
}
