import { net, protocol } from 'electron';
import { pathToFileURL } from 'node:url';
import { resolveInside } from './safePath';

/** Production pages load from lolping://app/... so fetch() works for sounds (file:// would block it). */
export const APP_SCHEME = 'lolping';

/** Must run before app 'ready'. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

export function serveRenderer(rootDir: string): void {
  protocol.handle(APP_SCHEME, (request) => {
    const file = resolveInside(rootDir, new URL(request.url).pathname);
    if (!file) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}
