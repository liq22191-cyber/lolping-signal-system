import type { Rect } from './coords';

/** A display with the number room pings use: #1 is the primary, the rest go left→right, then top→bottom. */
export interface NumberedDisplay {
  number: number;
  id: number;
  /** In DIPs, as Electron reports it. */
  bounds: Rect;
  primary: boolean;
}

export function numberDisplays(displays: readonly { id: number; bounds: Rect }[], primaryId: number): NumberedDisplay[] {
  const rest = displays.filter((d) => d.id !== primaryId).sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
  const primary = displays.filter((d) => d.id === primaryId);
  return [...primary, ...rest].map((d, i) => ({ number: i + 1, id: d.id, bounds: { ...d.bounds }, primary: d.id === primaryId }));
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** A point in a display's overlay (CSS px) → its display number and position as a fraction of that display. */
export function toShared(list: readonly NumberedDisplay[], displayId: number, x: number, y: number): { d: number; x: number; y: number } | null {
  const d = list.find((n) => n.id === displayId);
  if (!d || d.bounds.width <= 0 || d.bounds.height <= 0) return null;
  return { d: d.number, x: clamp01(x / d.bounds.width), y: clamp01(y / d.bounds.height) };
}

/** Where a room ping for display `d` lands here: that display, or the primary when this machine has no #d. */
export function resolveTarget(list: readonly NumberedDisplay[], d: number): NumberedDisplay | null {
  return list.find((n) => n.number === d) ?? list[0] ?? null;
}
