import type { SettingsApi } from '../../shared/ipc';

declare global {
  interface Window {
    settingsApi: SettingsApi;
  }
}

export const api: SettingsApi = window.settingsApi;
