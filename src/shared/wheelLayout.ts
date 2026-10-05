import { WHEEL_SLOTS, isPingId, type PingId } from './pings';

/** A wheel is exactly WHEEL_SLOTS known ids, each at most once. */
export function isValidWheel(v: unknown): v is PingId[] {
  return isValidWheelOf(v, isPingId);
}

/** Generic form of isValidWheel, for wheels of other item types (emotes). */
export function isValidWheelOf<T extends string>(v: unknown, isId: (x: unknown) => x is T): v is T[] {
  return Array.isArray(v) && v.length === WHEEL_SLOTS && v.every(isId) && new Set(v).size === v.length;
}

/** Puts `id` in `slot`. If it is already elsewhere on the wheel, the two slots swap so no item appears twice. */
export function placeOnSlot<T extends string>(wheel: readonly T[], id: T, slot: number): T[] {
  const from = wheel.indexOf(id);
  if (from >= 0) return swapSlots(wheel, from, slot);
  const next = [...wheel];
  next[slot] = id;
  return next;
}

export function swapSlots<T extends string>(wheel: readonly T[], a: number, b: number): T[] {
  const next = [...wheel];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

/** Where a dragged or click-selected item in a wheel editor came from. */
export type WheelSource =
  | { from: 'pool'; id: string }
  | { from: 'slot'; id: string; slot: number }
  | { from: 'center'; id: string };
/** A wheel slot index, or the centre (the trigger + click ping). */
export type WheelTarget = number | 'center';
export type WheelPatch = { wheel?: PingId[]; clickPingId?: PingId };

/** The settings change for dropping `src` on `target`, or null when nothing changes. */
export function dropPatch(wheel: readonly PingId[], clickPingId: PingId, src: WheelSource, target: WheelTarget): WheelPatch | null {
  const srcId = src.id as PingId;
  if (target === 'center') return srcId === clickPingId ? null : { clickPingId: srcId };
  if (src.from === 'slot') return src.slot === target ? null : { wheel: swapSlots(wheel, src.slot, target) };
  return wheel[target] === srcId ? null : { wheel: placeOnSlot(wheel, srcId, target) };
}

/** dropPatch for wheels without a centre target (the emote wheel). */
export function slotDropPatch<T extends string>(wheel: readonly T[], src: WheelSource, target: number): T[] | null {
  const srcId = src.id as T;
  if (src.from === 'slot') return src.slot === target ? null : swapSlots(wheel, src.slot, target);
  return wheel[target] === srcId ? null : placeOnSlot(wheel, srcId, target);
}
