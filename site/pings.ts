// The overlay modules import '../../shared/pings'; site/vite.config.ts points that import here.
// Same ping table, with asset URLs relative to the site root instead of a page folder.
export * from '../src/shared/pings';

export const textureUrl = (name: string): string => `./textures/${name}.png`;
export const soundUrl = (name: string): string => `./sounds/${name}.wav`;
