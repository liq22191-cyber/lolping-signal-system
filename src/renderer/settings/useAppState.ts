import { useCallback, useEffect, useState } from 'react';
import type { AppStatus, SetSettingsResult } from '../../shared/ipc';
import type { Settings } from '../../shared/settings';
import { api } from './api';

export type Update = (patch: Partial<Settings>) => Promise<SetSettingsResult>;

export function useAppState(): { settings: Settings | null; status: AppStatus | null; update: Update } {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<AppStatus | null>(null);

  useEffect(() => {
    void api.getSettings().then(setSettings);
    void api.getStatus().then(setStatus);
    const offSettings = api.onSettings(setSettings);
    const offStatus = api.onStatus(setStatus);
    return () => {
      offSettings();
      offStatus();
    };
  }, []);

  const update = useCallback<Update>(async (patch) => {
    const result = await api.setSettings(patch);
    setSettings(result.settings);
    return result;
  }, []);

  return { settings, status, update };
}
