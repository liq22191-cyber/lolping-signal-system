// Bundles peer.ts with esbuild (a dev dependency) and runs it. Usage: see README.md here.
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(tmpdir(), 'lolping-room-peer.mjs');
await build({ entryPoints: [join(here, 'peer.ts')], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'warning' });
await import(pathToFileURL(out).href);
