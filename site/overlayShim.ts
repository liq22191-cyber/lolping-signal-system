import type { OverlayApi } from '../src/preload/overlay';
import type { OverlayChannel, OverlayEvents } from '../src/shared/ipc';

// Stands in for the overlay preload. The page sends the overlay the same messages the main process sends in the app.
type Listener = (payload: never) => void;
const listeners = new Map<OverlayChannel, Listener[]>();

const api: OverlayApi = {
  on(channel, cb) {
    listeners.set(channel, [...(listeners.get(channel) ?? []), cb as Listener]);
  },
  reportMissingAssets(names) {
    console.warn('lolPing demo: missing assets', names);
  },
  reportPing() {
    // the demo has no room to share pings with
  },
};
window.overlay = api;

export function emit<C extends OverlayChannel>(channel: C, payload: OverlayEvents[C]): void {
  for (const cb of listeners.get(channel) ?? []) (cb as (p: OverlayEvents[C]) => void)(payload);
}
