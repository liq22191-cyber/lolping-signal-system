import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { pruneAssets } from '../tools/pruneAssets';

// A browser demo page. It runs the app's real overlay renderer (wheel, pings, sounds) with an input shim in place of
// the native helper. tools/capture-media records the README GIF from it; it isn't deployed anywhere for now. Paths are relative to the repo root, where the npm scripts run.
export default defineConfig({
  root: resolve('site'),
  base: './',
  publicDir: resolve('assets'),
  resolve: {
    // The overlay page sits one folder down and loads ../textures; the site serves assets from its root.
    alias: [{ find: /^\.\.\/\.\.\/shared\/pings$/, replacement: resolve('site/pings.ts') }],
  },
  plugins: [
    pruneAssets(),
    {
      name: 'lolping-og-image',
      generateBundle() {
        // Link-preview image (Discord, X...). `npm run media` makes it, so the very first build may not have it.
        const og = resolve('docs/media/og.png');
        if (existsSync(og)) this.emitFile({ type: 'asset', fileName: 'og.png', source: readFileSync(og) });
        else this.warn('docs/media/og.png not found: run `npm run media`');
      },
    },
  ],
  build: { outDir: resolve('site-dist'), emptyOutDir: true },
});
