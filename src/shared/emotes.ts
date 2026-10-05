/**
 * League emotes, shown by the emote wheel (default trigger: hold Ctrl and drag).
 * Names live in i18n.ts (`emoteNames`); this module only carries ids and art.
 */
export type EmoteId =
  | 'wellplayed' | 'weak' | 'teemo_good' | 'teemo_shocked' | 'amumu_cry' | 'for_me' | 'ff20'
  | 'laugh_cry' | 'done' | 'no_offense' | 'thumbs_up' | 'braum_love' | 'vitamin_sea';

export interface EmoteDef {
  id: EmoteId;
  /** Texture on the wheel slice and at the cursor: file in assets/emotes without ".png". */
  icon: string;
  /** Ring colour under the emote. */
  color: string;
}

/** Every emote, in the order the settings window lists them: the default wheel, then the extras. */
export const ALL_EMOTES: readonly EmoteDef[] = [
  { id: 'wellplayed', icon: 'wellplayed', color: '#f2b320' },
  { id: 'weak', icon: 'weak', color: '#ff3b55' },
  { id: 'teemo_good', icon: 'teemo_good', color: '#56d43c' },
  { id: 'teemo_shocked', icon: 'teemo_shocked', color: '#f2c518' },
  { id: 'amumu_cry', icon: 'amumu_cry', color: '#2e8bff' },
  { id: 'for_me', icon: 'for_me', color: '#f2b320' },
  { id: 'ff20', icon: 'ff20', color: '#ff3b55' },
  { id: 'laugh_cry', icon: 'laugh_cry', color: '#f2c518' },
  { id: 'done', icon: 'done', color: '#56d43c' },
  { id: 'no_offense', icon: 'no_offense', color: '#2e8bff' },
  { id: 'thumbs_up', icon: 'thumbs_up', color: '#35d27a' },
  { id: 'braum_love', icon: 'braum_love', color: '#ff7ab8' },
  { id: 'vitamin_sea', icon: 'vitamin_sea', color: '#2e8bff' },
];

/** The default emote wheel, top (N) then clockwise. The rest are extras for the settings pool. */
export const DEFAULT_EMOTE_WHEEL: readonly EmoteId[] = ALL_EMOTES.slice(0, 8).map((e) => e.id);

export function emoteById(id: string): EmoteDef | undefined {
  return ALL_EMOTES.find((e) => e.id === id);
}

export const isEmoteId = (v: unknown): v is EmoteId => typeof v === 'string' && emoteById(v) !== undefined;

/** Looks up ids already known to be valid (from normalized settings). */
export const emotesFor = (ids: readonly EmoteId[]): EmoteDef[] => ids.map((id) => emoteById(id) as EmoteDef);

/** Relative to a renderer page at <root>/<page>/index.html; assets/ is served at <root>/. */
export const emoteUrl = (name: string): string => `../emotes/${name}.png`;

export function allEmoteTextureNames(): string[] {
  return [...new Set(ALL_EMOTES.map((e) => e.icon))];
}
