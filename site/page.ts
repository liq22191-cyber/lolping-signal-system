import pkg from '../package.json';
import type { PingId } from '../src/shared/pings';
import { Autoplay, DEMO_STROKES, HUNG_STROKES } from './autoplay';
import { initInput, onUserPing } from './input';
import { emit } from './overlayShim';
import { DEFAULT_WHEEL_PINGS, textureUrl } from './pings';
import { isSoundOn, setSoundOn } from './sound';

const MEANINGS: Record<PingId, string> = {
  danger: 'Back off, it’s not safe here.',
  push: 'Take the wave or the tower.',
  omw: 'I’m heading there.',
  allin: 'Everybody commit, now.',
  assist: 'Come help me here.',
  needvision: 'Someone ward this spot.',
  missing: 'My lane opponent left.',
  enemyvision: 'They have a ward here.',
  generic: 'Look here.',
  bait: 'Act weak and lure them in.',
  visioncleared: 'Their ward here is gone.',
};

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector(sel) as T;

function buildLegend(list: HTMLElement): void {
  for (const p of DEFAULT_WHEEL_PINGS) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ping-pick';
    button.innerHTML = `<span class="badge"><img alt="" width="44" height="44"></span><span class="txt"><b></b><span></span></span>`;
    (button.querySelector('img') as HTMLImageElement).src = textureUrl(p.icon);
    (button.querySelector('b') as HTMLElement).textContent = p.name;
    (button.querySelector('.txt span') as HTMLElement).textContent = MEANINGS[p.id];
    button.addEventListener('click', () => {
      const r = (button.querySelector('.badge') as HTMLElement).getBoundingClientRect();
      emit('ping:spawn', { id: p.id, x: r.left + window.scrollX + r.width / 2, y: r.top + window.scrollY + r.height / 2 });
    });
    li.append(button);
    list.append(li);
  }
}

function initSoundToggle(button: HTMLButtonElement): void {
  const render = () => {
    const on = isSoundOn();
    button.setAttribute('aria-pressed', String(on));
    button.textContent = on ? 'Sound on' : 'Sound off';
  };
  button.addEventListener('click', () => {
    setSoundOn(!isSoundOn());
    render();
  });
  render();
}

/** A still for the link-preview image: pings on the windows and the wheel open next to them. */
function pose(stage: HTMLElement, hung: boolean): void {
  const r = stage.getBoundingClientRect();
  const at = (fx: number, fy: number) => ({ x: r.left + window.scrollX + fx * r.width, y: r.top + window.scrollY + fy * r.height });
  if (hung) {
    emit('ping:spawn', { id: 'missing', ...at(0.22, 0.44) });
    emit('ping:spawn', { id: 'missing', ...at(0.42, 0.56) });
  } else {
    emit('ping:spawn', { id: 'omw', ...at(0.2, 0.42) });
    emit('ping:spawn', { id: 'allin', ...at(0.8, 0.52) });
  }
  const c = hung ? at(0.76, 0.52) : at(0.5, 0.5);
  const hover = hung ? { x: -160, y: 0 } : { x: 125, y: -120 };
  emit('wheel:open', c);
  emit('wheel:move', { x: c.x + hover.x, y: c.y + hover.y });
  const cursor = $<HTMLElement>('#cursor');
  cursor.style.transform = `translate(${c.x + hover.x}px, ${c.y + hover.y}px)`;
  cursor.classList.add('on', 'down');
}

export function startPage(): void {
  const stage = $<HTMLElement>('#stage');
  const autoplay = new Autoplay(stage, $<HTMLElement>('#cursor'));

  for (const el of document.querySelectorAll<HTMLElement>('[data-version]')) el.textContent = pkg.version;
  buildLegend($<HTMLElement>('#legend'));
  initSoundToggle($<HTMLButtonElement>('#sound'));
  initInput(stage);
  onUserPing(() => document.body.classList.add('pinged'));

  // tools/capture-media drives the page itself: stage only, nothing automatic.
  // ?capture=hung shows the README's scene: a frozen app asking to wait or end it.
  const capture = new URLSearchParams(location.search).get('capture');
  if (capture !== null) {
    const hung = capture === 'hung';
    // &lang=zh swaps the scene's text for the Chinese README's GIF.
    if (new URLSearchParams(location.search).get('lang') === 'zh') {
      document.documentElement.lang = 'zh-CN';
      for (const el of document.querySelectorAll<HTMLElement>('[data-zh]')) el.textContent = el.dataset.zh ?? '';
    }
    document.body.classList.add('capture');
    document.body.classList.toggle('scene-hung', hung);
    (window as unknown as { lolpingDemo: object }).lolpingDemo = {
      play: () => autoplay.play(hung ? HUNG_STROKES : DEMO_STROKES),
      pose: () => pose(stage, hung),
    };
    return;
  }

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const seen = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      seen.disconnect();
      if (!document.body.classList.contains('pinged')) void autoplay.play();
    },
    { threshold: 0.6 },
  );
  seen.observe(stage);
}
