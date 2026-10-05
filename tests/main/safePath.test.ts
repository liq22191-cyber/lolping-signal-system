import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveInside } from '../../src/main/safePath';

const root = join('C:', 'app', 'renderer');

describe('resolveInside', () => {
  it('resolves files inside the root', () => {
    expect(resolveInside(root, '/overlay/index.html')).toBe(join(root, 'overlay', 'index.html'));
    expect(resolveInside(root, '/textures/omw.png')).toBe(join(root, 'textures', 'omw.png'));
  });

  it('rejects paths that escape the root', () => {
    expect(resolveInside(root, '/../secret.txt')).toBeNull();
    expect(resolveInside(root, '/%2e%2e/secret.txt')).toBeNull();
    expect(resolveInside(root, '/overlay/../../x')).toBeNull();
  });

  it('rejects the root itself and malformed escapes', () => {
    expect(resolveInside(root, '/')).toBeNull();
    expect(resolveInside(root, '/%E0%A4%A')).toBeNull();
  });
});
