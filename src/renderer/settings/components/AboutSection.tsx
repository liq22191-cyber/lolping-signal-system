import { Button } from '@fluentui/react-components';
import { useEffect, useState, type ReactNode } from 'react';
import type { About } from '../../../shared/ipc';
import { api } from '../api';
import { useText } from '../text';
import { SettingRow } from './rows';

export function AboutSection({ icon }: { icon: ReactNode }) {
  const t = useText();
  const [about, setAbout] = useState<About | null>(null);
  // Limitations and problems come translated from the main process: re-read them when the language changes.
  useEffect(() => {
    void api.getAbout().then(setAbout);
  }, [t]);
  if (!about) return null;
  return (
    <>
      <SettingRow icon={icon} title={t.about} description={t.aboutDesc(about.version)}>
        <Button onClick={() => void api.openProjectPage()}>{t.githubPage}</Button>
        <Button onClick={() => void api.openSettingsFolder()}>{t.openSettingsFolder}</Button>
      </SettingRow>
      {about.problems.length > 0 ? (
        <div className="card notes">
          <div className="lbl">
            <b>{t.problems}</b>
            {about.problems.map((p) => <span key={p} className="desc">• {p}</span>)}
          </div>
        </div>
      ) : null}
      <div className="card notes">
        <div className="lbl">
          <b>{t.knownLimitations}</b>
          {about.limitations.map((l) => <span key={l} className="desc">• {l}</span>)}
        </div>
      </div>
    </>
  );
}
