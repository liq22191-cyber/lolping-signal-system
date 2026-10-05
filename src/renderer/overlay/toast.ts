import { textureUrl } from '../../shared/pings';

export function showToast(layer: HTMLElement, title: string, body: string, ms = 1800): void {
  layer.querySelectorAll('.toast').forEach((t) => t.remove());
  const toast = document.createElement('div');
  toast.className = 'toast';
  const icon = document.createElement('img');
  icon.src = textureUrl('generic_ping');
  const text = document.createElement('div');
  const b = document.createElement('b');
  b.textContent = title;
  const small = document.createElement('small');
  small.textContent = body;
  text.append(b, small);
  toast.append(icon, text);
  layer.append(toast);
  setTimeout(() => {
    toast.classList.add('out');
    setTimeout(() => toast.remove(), 220);
  }, ms);
}
