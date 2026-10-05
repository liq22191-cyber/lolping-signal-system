import type { OverlayApi } from '../../preload/overlay';

declare global {
  interface Window {
    overlay: OverlayApi;
  }
}

export {};
