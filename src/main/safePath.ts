import { isAbsolute, join, normalize, relative } from 'node:path';

/** Resolves a URL pathname to a file inside `root`; null if it escapes the root or is malformed. */
export function resolveInside(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const file = normalize(join(root, decoded));
  const rel = relative(root, file);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null;
  return file;
}
