/** The desktop platforms lolPing runs on. Shared code takes this instead of reading process.platform. */
export type Platform = 'win' | 'mac';

export const platformOf = (nodePlatform: string): Platform => (nodePlatform === 'darwin' ? 'mac' : 'win');
