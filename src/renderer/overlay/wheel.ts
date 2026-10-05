import { WHEEL, pickSlice } from '../../shared/geometry';
import { WHEEL_SLOTS } from '../../shared/pings';

const NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent.append(e);
  return e;
}

const polar = (r: number, deg: number): [number, number] => [r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180)];

function sector(r0: number, r1: number, a0: number, a1: number): string {
  const [x0, y0] = polar(r0, a0);
  const [x1, y1] = polar(r1, a0);
  const [x2, y2] = polar(r1, a1);
  const [x3, y3] = polar(r0, a1);
  return `M${x0},${y0} L${x1},${y1} A${r1},${r1} 0 0 1 ${x2},${y2} L${x3},${y3} A${r0},${r0} 0 0 0 ${x0},${y0}Z`;
}

export interface WheelOptions {
  /** Centre decoration: image URL and label (the ping wheel shows the generic ping icon and "PING"). */
  centerIcon?: string;
  centerText?: string;
}

/** The League-style radial wheel (see prototype/wheel-demo.html), shared by pings and emotes. */
export class Wheel<T> {
  private readonly wedges: SVGPathElement[] = [];
  private readonly icons: SVGImageElement[] = [];
  private items: readonly T[] = [];
  private iconFor: (item: T) => string = () => '';
  private hot = -1;
  private ox = 0;
  private oy = 0;
  private opened = false;

  constructor(
    private readonly svg: SVGSVGElement,
    private readonly onHover: (slice: number) => void,
    opts: WheelOptions = {},
  ) {
    this.build(opts);
  }

  /** Changes which item each slice holds (from the user's wheel layout). */
  setItems(items: readonly T[], iconFor: (item: T) => string): void {
    this.items = items;
    this.iconFor = iconFor;
    items.forEach((item, i) => this.icons[i]?.setAttribute('href', iconFor(item)));
  }

  get isOpen(): boolean {
    return this.opened;
  }

  open(x: number, y: number): void {
    this.ox = x;
    this.oy = y;
    this.svg.style.left = `${x}px`;
    this.svg.style.top = `${y}px`;
    this.setHot(-1);
    this.opened = true;
    this.svg.classList.add('open');
  }

  move(x: number, y: number): void {
    if (this.opened) this.setHot(pickSlice(x - this.ox, y - this.oy));
  }

  /** Closes the wheel. Returns the chosen item at the wheel centre, or null when released in the dead zone. */
  release(x: number, y: number): { item: T; x: number; y: number } | null {
    if (!this.opened) return null;
    const slice = pickSlice(x - this.ox, y - this.oy);
    this.close();
    return slice >= 0 && slice < this.items.length ? { item: this.items[slice], x: this.ox, y: this.oy } : null;
  }

  cancel(): void {
    if (this.opened) this.close();
  }

  private close(): void {
    this.opened = false;
    this.svg.classList.remove('open');
    this.setHot(-1);
  }

  private setHot(i: number): void {
    if (i === this.hot) return;
    if (this.hot >= 0) {
      this.wedges[this.hot].setAttribute('fill-opacity', '0');
      this.icons[this.hot].classList.remove('hot');
    }
    this.hot = i;
    if (i >= 0) {
      this.wedges[i].setAttribute('fill-opacity', '0.55');
      this.icons[i].classList.add('hot');
      if (this.opened) this.onHover(i);
    }
  }

  private build(opts: WheelOptions): void {
    const { innerR, outerR, extR, iconR, iconSize } = WHEEL;
    const svg = this.svg;
    el('defs', {}, svg).innerHTML = `
      <radialGradient id="lp-ext" cx="0" cy="0" r="${extR}" gradientUnits="userSpaceOnUse">
        <stop offset="${outerR / extR}" stop-color="#5c6066" stop-opacity=".55"/><stop offset="1" stop-color="#5c6066" stop-opacity="0"/></radialGradient>
      <radialGradient id="lp-ring" cx="0" cy="0" r="${outerR}" gradientUnits="userSpaceOnUse">
        <stop offset="${innerR / outerR}" stop-color="#2a2d31"/><stop offset="1" stop-color="#4a4e54"/></radialGradient>
      <radialGradient id="lp-hot" cx="0" cy="0" r="${extR}" gradientUnits="userSpaceOnUse">
        <stop offset="${innerR / extR}" stop-color="#8a8f96"/><stop offset="${outerR / extR}" stop-color="#9aa0a8"/>
        <stop offset="1" stop-color="#9aa0a8" stop-opacity="0"/></radialGradient>
      <radialGradient id="lp-core" cx="0" cy="-10" r="${innerR}" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#2c5d60"/><stop offset="1" stop-color="#11292c"/></radialGradient>`;

    const slots = [...Array(WHEEL_SLOTS).keys()];
    slots.forEach((i) => {
      const mid = -90 + i * 45;
      if (i % 2 === 0) el('path', { d: sector(outerR, extR, mid - 22.5, mid + 22.5), fill: 'url(#lp-ext)' }, svg);
    });
    el('circle', { r: (innerR + outerR) / 2, fill: 'none', stroke: 'url(#lp-ring)', 'stroke-width': outerR - innerR, opacity: 0.92 }, svg);
    slots.forEach((i) => {
      const mid = -90 + i * 45;
      const reach = i % 2 === 0 ? extR : outerR;
      this.wedges.push(el('path', { d: sector(innerR, reach, mid - 22.5, mid + 22.5), fill: 'url(#lp-hot)', 'fill-opacity': 0, class: 'wedge' }, svg));
      const [x0, y0] = polar(innerR, mid - 22.5);
      const [x1, y1] = polar(outerR, mid - 22.5);
      el('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: '#a08a5c', 'stroke-opacity': 0.45, 'stroke-width': 1.2 }, svg);
    });
    // Icons get their href from setItems(); the wheel may show before the first settings push.
    slots.forEach((i) => {
      const [ix, iy] = polar(iconR, -90 + i * 45);
      this.icons.push(el('image', { x: ix - iconSize / 2, y: iy - iconSize / 2, width: iconSize, height: iconSize, class: 'icon' }, svg));
    });

    el('circle', { r: innerR + 4, fill: 'none', stroke: '#1a1a1a', 'stroke-width': 6, opacity: 0.6 }, svg);
    el('circle', { r: innerR, fill: 'url(#lp-core)', stroke: '#c8aa6e', 'stroke-width': 3 }, svg);
    el('circle', { r: innerR - 7, fill: 'none', stroke: '#8a7448', 'stroke-width': 1, opacity: 0.6 }, svg);
    if (opts.centerIcon) el('image', { href: opts.centerIcon, x: -20, y: -58, width: 40, height: 40 }, svg);
    el('text', { x: 0, y: 6, 'text-anchor': 'middle', class: 'centerTxt' }, svg).textContent = opts.centerText ?? '';
    el('text', { x: 6, y: 50, 'text-anchor': 'middle', class: 'backTxt' }, svg).textContent = 'BACK';
    const mouse = el('g', { opacity: 0.55, transform: 'translate(-26,40)' }, svg);
    el('rect', { x: 0, y: 0, width: 11, height: 16, rx: 5.5, fill: 'none', stroke: '#6c7a7c', 'stroke-width': 1.3 }, mouse);
    el('path', { d: 'M5.5,0 V7 H11 V5.5 A5.5,5.5 0 0 0 5.5,0Z', fill: '#6c7a7c' }, mouse);
  }
}
