export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One monitor: its rect in DIPs (Electron) and in physical pixels (the hook helper). */
export interface DisplayMap {
  id: number;
  dip: Rect;
  phys: Rect;
  scale: number;
}

export interface LocalPoint {
  displayId: number;
  x: number;
  y: number;
}

const contains = (r: Rect, x: number, y: number): boolean =>
  x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;

function distSq(r: Rect, x: number, y: number): number {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.width - 1));
  const dy = Math.max(r.y - y, 0, y - (r.y + r.height - 1));
  return dx * dx + dy * dy;
}

export function displayAtPhysical(x: number, y: number, maps: readonly DisplayMap[]): DisplayMap | null {
  if (maps.length === 0) return null;
  return maps.find((m) => contains(m.phys, x, y)) ?? maps.reduce((a, b) => (distSq(b.phys, x, y) < distSq(a.phys, x, y) ? b : a));
}

/** Physical screen pixels → global DIP coordinates, using the display under the point. */
export function physicalToDip(x: number, y: number, maps: readonly DisplayMap[]): { display: DisplayMap; x: number; y: number } | null {
  const d = displayAtPhysical(x, y, maps);
  if (!d) return null;
  return { display: d, x: d.dip.x + (x - d.phys.x) / d.scale, y: d.dip.y + (y - d.phys.y) / d.scale };
}

/** Physical point → CSS pixels inside the overlay of `displayId` (default: the display under the point). */
export function physicalToLocal(x: number, y: number, maps: readonly DisplayMap[], displayId?: number): LocalPoint | null {
  const p = physicalToDip(x, y, maps);
  if (!p) return null;
  const target = displayId === undefined ? p.display : maps.find((m) => m.id === displayId);
  if (!target) return null;
  return { displayId: target.id, x: p.x - target.dip.x, y: p.y - target.dip.y };
}
